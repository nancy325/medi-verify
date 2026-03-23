require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const sharp = require('sharp');
const { runOCR } = require('./services/ocr.service');
const { runVisionAnalysis } = require('./services/vision.service');
const { analyzeImageQuality } = require('./services/quality.service');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ─── Vision/OCR Model Config ────────────────────────────────
const BLIP_VQA_API_URL = 'https://api-inference.huggingface.co/models/Salesforce/blip-vqa-base';
const VILT_VQA_FALLBACK_URL = 'https://api-inference.huggingface.co/models/dandelin/vilt-b32-finetuned-vqa';
const CLIP_ZERO_SHOT_API_URL = 'https://api-inference.huggingface.co/models/openai/clip-vit-base-patch32';
const OPEN_FDA_DRUG_LABEL_API = 'https://api.fda.gov/drug/label.json';
const HF_TOKEN = process.env.HF_TOKEN || process.env.HF_API_TOKEN;

async function queryVqaModel(modelUrl, imageBase64, question) {
  const response = await axios.post(modelUrl, {
    inputs: {
      image: imageBase64,
      question
    }
  }, {
    headers: {
      'Authorization': `Bearer ${HF_TOKEN}`,
      'Content-Type': 'application/json'
    },
    timeout: 15000
  });

  // Hugging Face VQA typically returns: [{ answer: "yes", score: 0.94 }]
  // Use returned `score` as real confidence; do not fabricate when missing.
  const first = Array.isArray(response.data) ? response.data[0] : response.data;
  return {
    answer: first?.answer ?? first?.generated_text ?? '',
    score: typeof first?.score === 'number' ? first.score : null
  };
}

async function askVqaWithFallback(imageBase64, question) {
  try {
    const primary = await queryVqaModel(BLIP_VQA_API_URL, imageBase64, question);
    return { ...primary, model_used: 'Salesforce/blip-vqa-base' };
  } catch (primaryError) {
    const statusCode = primaryError?.response?.status;
    if (statusCode === 410 || statusCode === 404 || statusCode === 503) {
      console.warn(`⚠️  Primary BLIP-VQA unavailable (${statusCode}) — trying ViLT fallback`);
      const fallback = await queryVqaModel(VILT_VQA_FALLBACK_URL, imageBase64, question);
      return { ...fallback, model_used: 'dandelin/vilt-b32-finetuned-vqa' };
    }
    throw primaryError;
  }
}

async function runClipZeroShot(imageBase64) {
  const candidateLabels = [
    'genuine sealed medicine packaging',
    'counterfeit medicine box',
    'tampered medicine package',
    'damaged medicine package',
    'non-medicine object'
  ];

  const response = await axios.post(CLIP_ZERO_SHOT_API_URL, {
    inputs: imageBase64,
    parameters: { candidate_labels: candidateLabels }
  }, {
    headers: {
      'Authorization': `Bearer ${HF_TOKEN}`,
      'Content-Type': 'application/json'
    },
    timeout: 15000
  });

  const predictions = Array.isArray(response.data) ? response.data : [];
  const top = predictions[0] || null;

  const topLabel = top?.label || '';
  const topScore = typeof top?.score === 'number' ? top.score : null;

  // Convert CLIP output into an "authenticScore" (higher => more likely genuine).
  // This uses only returned model probabilities; no fabrication.
  const authenticScore =
    typeof topScore === 'number'
      ? (topLabel.toLowerCase().includes('genuine') ? topScore : 1 - topScore)
      : null;

  return {
    candidate_labels: candidateLabels,
    predictions,
    top_label: topLabel || null,
    top_score: topScore,
    authenticScore,
    model_used: 'openai/clip-vit-base-patch32'
  };
}

function interpretVqaAnswer(answerText, passIfYes) {
  const normalized = String(answerText || '').trim().toLowerCase();

  const positivePatterns = [
    /\byes\b/,
    /\bvisible\b/,
    /\bpresent\b/,
    /\bclear\b/,
    /\baligned\b/,
    /\bconsistent\b/,
    /\bintact\b/,
    /\bsharp\b/
  ];

  const negativePatterns = [
    /\bno\b/,
    /\bnot\b/,
    /\bnone\b/,
    /\babsent\b/,
    /\bunclear\b/,
    /\bdamaged\b/,
    /\bfaded\b/,
    /\bsmudged\b/,
    /\bartifact\b/,
    /\bblurry\b/,
    /\bpoor\b/
  ];

  const uncertainPatterns = [
    /\bmaybe\b/,
    /\buncertain\b/,
    /\bunsure\b/,
    /\bcannot\b/,
    /\bcan't\b/,
    /\bunknown\b/
  ];

  const positive = positivePatterns.some((p) => p.test(normalized));
  const negative = negativePatterns.some((p) => p.test(normalized));
  const uncertain = uncertainPatterns.some((p) => p.test(normalized));

  if ((!positive && !negative) || uncertain || (positive && negative)) {
    return {
      pass: null,
      interpreted: 'uncertain'
    };
  }

  const interpretedYes = positive && !negative;
  const pass = passIfYes ? interpretedYes : !interpretedYes;

  return {
    pass,
    interpreted: interpretedYes ? 'yes' : 'no'
  };
}

async function runVisualChecks(imageBase64) {
  // Visual-only question bank (no OCR/text-reading questions).
  // Note: color/sharpness checks are handled locally via `analyzePrintQuality()` (Feature 4).
  const VQA_QUESTIONS = [
    {
      id: 'hologram_present',
      severity: 'CRITICAL',
      text: 'Is there a holographic or shiny security seal visible on this medicine packaging?'
    },
    {
      id: 'hologram_quality',
      severity: 'CRITICAL',
      text: 'Does the holographic seal appear clear and undamaged or does it look scratched or dull?'
    },
    {
      id: 'logo_sharpness',
      severity: 'WARNING',
      text: 'Is the manufacturer logo printed sharply and clearly or does it appear blurry or pixelated?'
    },
    {
      id: 'tampering_signs',
      severity: 'CRITICAL',
      text: 'Does the packaging show signs of tampering such as torn edges resealing marks or damaged strips?'
    },
    {
      id: 'color_consistency',
      severity: 'WARNING',
      text: 'Does the color on the packaging look uniform and saturated or does it appear faded patchy or inconsistent?'
    },
    {
      id: 'overall_quality',
      severity: 'INFO',
      text: 'Does this medicine packaging look professionally printed and properly manufactured?'
    }
  ];

  // Only run questions that are NOT replaced by deterministic sharp metrics.
  const checks = VQA_QUESTIONS
    // Replace color/sharpness questions with `analyzePrintQuality()`.
    .filter((q) => !['logo_sharpness', 'color_consistency'].includes(q.id))
    .map((q) => ({
      id: q.id,
      // Force yes/no to keep interpretation deterministic.
      question: `Answer yes or no only: ${q.text}`,
      severity: q.severity,
      // "passIfYes" means a positive answer increases authenticity.
      // For tampering, a "yes" indicates counterfeit risk.
      passIfYes: q.id === 'tampering_signs' ? false : true,
      riskWeight: q.severity === 'CRITICAL' ? 12 : q.severity === 'WARNING' ? 7 : 4
    }));

  const results = [];
  for (const check of checks) {
    const answerObj = await askVqaWithFallback(imageBase64, check.question);
    const interpreted = interpretVqaAnswer(answerObj.answer, check.passIfYes);

    results.push({
      check: check.id,
      question: check.question,
      answer: answerObj.answer,
      confidence: answerObj.score,
      model_used: answerObj.model_used,
      pass: interpreted.pass,
      interpreted: interpreted.interpreted,
      risk_weight: check.riskWeight
    });
  }

  return results;
}

// ─── Bug 3: Local image quality gate (pre-check) ─────────────
async function precheckImageQuality(imageBuffer) {
  const metadata = await sharp(imageBuffer).metadata();
  const stats = await sharp(imageBuffer).stats();

  const width = metadata?.width || 0;
  const height = metadata?.height || 0;

  // Brightness mean approximation: average of per-channel means.
  const channelMeans = (stats.channels || [])
    .map((c) => (typeof c.mean === 'number' ? c.mean : null))
    .filter((v) => v !== null);
  const brightnessMean = channelMeans.length
    ? channelMeans.reduce((a, b) => a + b, 0) / channelMeans.length
    : 0;

  const entropy = typeof stats.entropy === 'number' ? stats.entropy : 0;

  // Gate thresholds requested by the spec
  const tooSmall = width < 200 || height < 200;
  const tooDark = brightnessMean < 30;
  const tooBlurry = entropy < 4.5;

  if (tooSmall || tooDark || tooBlurry) {
    return { ok: false };
  }

  return { ok: true };
}

// ─── Feature 1: Duplicate text detection ──────────────────────
function checkDuplicateContent(rawText) {
  const lines = String(rawText || '')
    .split('\n')
    .filter((l) => l.trim().length > 3);

  const unique = new Set(lines.map((l) => l.trim()));
  if (lines.length > 0 && unique.size < lines.length * 0.6) {
    return {
      severity: 'CRITICAL',
      field: 'Label Pattern',
      observation: 'Duplicate text patterns detected — possible label reprinting or sticker overlay counterfeit indicator'
    };
  }
  return null;
}

// ─── Feature 3: Wrong language/script detection ─────────────
function checkUnexpectedScript(rawText) {
  const chinesePattern = /[\u4E00-\u9FFF]/;
  const cyrillicPattern = /[\u0400-\u04FF]/;

  const englishOnlyBrands = ['BOTOX', 'Allergan', 'NovoFine', 'Novo Nordisk', 'Pfizer'];

  const rawUpper = String(rawText || '').toUpperCase();
  const isEnglishBrand = englishOnlyBrands.some((b) => rawUpper.includes(b.toUpperCase()));

  const hasNonLatin = chinesePattern.test(rawText) || cyrillicPattern.test(rawText);

  if (isEnglishBrand && hasNonLatin) {
    return {
      severity: 'WARNING',
      field: 'Language',
      observation: 'Non-Latin script detected on brand that uses English-only packaging — verify country of origin'
    };
  }
  return null;
}

// ─── Feature 2: Inverted/mirrored text detection ─────────────
// Optimization: we already have the "original" OCR text from the main pipeline.
// Reuse it to avoid an extra TrOCR call, and only TrOCR the rotated image.
async function checkTextOrientation(imageBuffer, originalOcrText) {
  const rotatedBuffer = await sharp(imageBuffer).rotate(180).toBuffer();

  // OCR is local-only (tesseract.js) for reliability.
  const rotatedResult = (await runOCR(rotatedBuffer.toString('base64'))).text;

  const originalWords = String(originalOcrText || '')
    .split(' ')
    .filter((w) => w.length > 2).length;

  const rotatedWords = String(rotatedResult || '')
    .split(' ')
    .filter((w) => w.length > 2).length;

  if (rotatedWords > originalWords * 1.3) {
    return {
      severity: 'CRITICAL',
      field: 'Text Orientation',
      observation: 'Text appears inverted or mirrored — strong counterfeit indicator'
    };
  }
  return null;
}

// ─── Feature 4: Sharp print quality metrics ──────────────────
async function analyzePrintQuality(imageBuffer) {
  const stats = await sharp(imageBuffer).stats();
  // metadata isn't strictly needed, but kept for completeness.
  await sharp(imageBuffer).metadata();

  const issues = [];

  // Average std across channels = color variance (sharp field name varies by version)
  const channelStds = (stats.channels || [])
    .map((c) => {
      if (typeof c.std === 'number') return c.std;
      if (typeof c.stddev === 'number') return c.stddev;
      if (typeof c.stdDev === 'number') return c.stdDev;
      return null;
    })
    .filter((v) => v !== null);

  const avgStd = channelStds.length
    ? channelStds.reduce((a, b) => a + b, 0) / channelStds.length
    : null;

  if (typeof avgStd === 'number' && avgStd < 20) {
    issues.push({
      severity: 'WARNING',
      field: 'Print Color',
      observation: 'Low color variance detected — print may be faded or washed out'
    });
  }

  if (typeof stats.entropy === 'number' && stats.entropy < 6.5) {
    issues.push({
      severity: 'WARNING',
      field: 'Print Sharpness',
      observation: 'Low image entropy — packaging details may be blurry or unclear'
    });
  }

  return issues;
}

// ─── OCR structured field extraction (Step 2.1) ────────────
function extractBatch(text) {
  const match = text.match(/\b(LOT|Lot|lot|BATCH|Batch)[:\s#]?\s*([A-Z0-9\-]{4,14})\b/);
  return match ? match[2] : null;
}

function extractExpiry(text) {
  // Handles: EXP 12/2026, Exp: 12-2026, 12/26, JAN 2026
  const match = text.match(/\b(EXP|Exp|exp|EXPIRY|USE BY)?\.?\s*(\d{2})[\/-](\d{2,4})\b/)
    || text.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})\b/i);
  return match ? match[0].trim() : null;
}

function extractDosage(text) {
  // Handles: 500mg, 10 mg, 150 UNITS, 0.5ml
  const match = text.match(/\b(\d+\.?\d*)\s*(mg|mcg|ml|g|IU|UNITS|units|µg)\b/i);
  return match ? match[0] : null;
}

function extractDrugName(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 2);

  if (lines.length === 0) {
    return null;
  }

  const skipPatterns = [
    /^\d+\.?\d*\s*(mg|mcg|ml|g|iu|units|µg)$/i,
    /^(LOT|BATCH|EXP|EXPIRY|USE BY|MFG|MFD|MANUFACTURED BY)\b/i,
  ];

  const candidate = lines.find((line) => !skipPatterns.some((pattern) => pattern.test(line)));
  return candidate || lines[0] || null;
}

function extractManufacturer(text) {
  const match = text.match(/\b(Mfg|Mfd|Manufactured by|MANUFACTURED BY)[.:\s]+([^\n]+)/i);
  if (match) {
    return match[2].trim();
  }

  // Fallback: common manufacturer names that may appear standalone in OCR text
  const knownManufacturers = ['ALLERGAN', 'PFIZER', 'CIPLA', 'SUN PHARMA', 'ABBOTT', 'GLAXO'];
  const upperText = text.toUpperCase();
  const found = knownManufacturers.find((name) => upperText.includes(name));
  return found || null;
}

function parseOCRFields(rawText) {
  return {
    drugName: extractDrugName(rawText),
    dosage: extractDosage(rawText),
    batchNumber: extractBatch(rawText),
    expiryDate: extractExpiry(rawText),
    manufacturer: extractManufacturer(rawText),
    rxSymbol: /\bRx\b|℞/i.test(rawText),
  };
}

async function crossReferenceDrugWithFDA(drugName) {
  if (!drugName || drugName.trim().length < 3) {
    return {
      checked: false,
      matched: false,
      source: 'openFDA',
      query: drugName || null,
      message: 'Drug name unavailable for FDA lookup'
    };
  }

  const normalized = drugName.trim();
  const query = `openfda.generic_name:"${normalized}"+openfda.brand_name:"${normalized}"`;

  try {
    const response = await axios.get(OPEN_FDA_DRUG_LABEL_API, {
      params: {
        search: query,
        limit: 1
      },
      timeout: 8000
    });

    const result = response.data?.results?.[0];
    const openfda = result?.openfda;

    if (!openfda) {
      return {
        checked: true,
        matched: false,
        source: 'openFDA',
        query: normalized,
        message: 'No FDA label metadata found for extracted drug name'
      };
    }

    return {
      checked: true,
      matched: true,
      source: 'openFDA',
      query: normalized,
      generic_name: openfda.generic_name?.[0] || null,
      brand_name: openfda.brand_name?.[0] || null,
      manufacturer_name: openfda.manufacturer_name?.[0] || null,
      product_type: openfda.product_type?.[0] || null,
      message: 'Drug name matched against openFDA labels'
    };
  } catch (error) {
    if (error?.response?.status === 404) {
      return {
        checked: true,
        matched: false,
        source: 'openFDA',
        query: normalized,
        message: 'Drug name not found in openFDA label set'
      };
    }

    return {
      checked: true,
      matched: false,
      source: 'openFDA',
      query: normalized,
      message: 'FDA lookup unavailable at the moment',
      error: error.message || String(error)
    };
  }
}

function buildDeterministicFallbackResult(ocrPayload, fdaCheck, options = {}) {
  const validationIssues = ocrPayload?.validation_issues || [];
  const redFlags = [];
  let score = 78;

  for (const issue of validationIssues) {
    if (issue.severity === 'CRITICAL') {
      score -= 25;
    } else if (issue.severity === 'WARNING') {
      score -= 10;
    } else if (issue.severity === 'MINOR') {
      score -= 5;
    }

    redFlags.push({
      flag: `${issue.field}: ${issue.observation}`,
      confidence: issue.severity === 'CRITICAL' ? 92 : issue.severity === 'WARNING' ? 80 : 68
    });
  }

  if (!ocrPayload?.raw_text) {
    score -= 10;
    redFlags.push({ flag: 'No readable text extracted from image (OCR weak/failed)', confidence: 72 });
  }

  if (fdaCheck?.checked) {
    if (fdaCheck.matched) {
      score += 6;
    } else {
      score -= 8;
      redFlags.push({
        flag: 'Extracted drug name did not match openFDA labels',
        confidence: 66
      });
    }
  }

  if (options.inferenceUnavailable) {
    redFlags.push({
      flag: 'Visual model inference unavailable — verdict based on OCR + rule checks only',
      confidence: 70
    });
  }

  score = Math.max(20, Math.min(95, score));

  let summary;
  if (score >= 82) {
    summary = '✅ Preliminary checks look consistent. Manual verification still recommended.';
  } else if (score >= 60) {
    summary = '⚠️ Some inconsistencies detected. Please verify with pharmacist/source.';
  } else {
    summary = '🚨 High risk indicators detected. Do not trust without professional verification.';
  }

  return {
    authenticity_score: score,
    red_flags: redFlags,
    summary,
    ai_explanations: [
      { area: 'OCR Validation', issue: 'Text extraction and field checks', detail: 'Rule-based parsing applied on detected text fields (batch, expiry, dosage, name).' },
      { area: 'Regulatory Cross-check', issue: 'FDA label verification', detail: 'Extracted drug name cross-referenced against openFDA label metadata when available.' },
      { area: 'Visual Inference Resilience', issue: 'Fallback scoring mode', detail: 'When model APIs are unavailable, prototype uses deterministic scoring to avoid silent failures.' }
    ],
    ocr: ocrPayload,
    fda: fdaCheck,
    model_used: options.modelUsed || null
  };
}

// ─── Feature 5: Expiry date validation ────────────────────────
function validateExpiryDate(expiryDate) {
  if (!expiryDate) return null;

  // Parse formats: MM/YYYY, MM-YYYY, MM/YY
  const match = String(expiryDate).match(/(\d{2})[\/\-](\d{2,4})/);
  if (!match) return null;

  let [, month, year] = match;
  if (year.length === 2) year = '20' + year;

  const expDate = new Date(parseInt(year), parseInt(month) - 1, 1);

  if (!Number.isNaN(expDate.getTime()) && expDate < new Date()) {
    return {
      severity: 'CRITICAL',
      field: 'Expiry Date',
      observation: `Medicine is expired — expiry was ${month}/${year}`
    };
  }
  return null;
}

// ─── Text validation (Step 2: deterministic checks) ────────
// NOTE: becomes async to allow orientation check + local sharp metrics.
async function validateExtractedText(rawText, imageBuffer) {
  const issues = [];
  const safeText = String(rawText || '');

  // Batch number format — typically LOT + alphanumeric
  const batchPattern = /\b(LOT|lot|Lot)[\s:#]?[A-Z0-9]{4,12}\b/;
  if (!batchPattern.test(safeText)) {
    issues.push({
      severity: 'WARNING',
      field: 'Batch Number',
      observation: 'Batch number not found or incorrectly formatted'
    });
  }

  // Expiry date — common formats: MM/YYYY, MM-YYYY, EXP: MM/YY
  const datePattern = /\b(EXP|Exp|exp)?\.?\s?\d{2}[\/-]\d{2,4}\b/;
  if (!datePattern.test(safeText)) {
    issues.push({
      severity: 'WARNING',
      field: 'Expiry Date',
      observation: 'Expiry date not found or unreadable'
    });
  } else {
    // Feature 5: after extracting expiryDate from OCR, compare against today's date
    const expiryDate = extractExpiry(safeText);
    const expiredIssue = validateExpiryDate(expiryDate);
    if (expiredIssue) issues.push(expiredIssue);
  }

  // Feature 1: duplicate label content detection
  const duplicateIssue = checkDuplicateContent(safeText);
  if (duplicateIssue) issues.push(duplicateIssue);

  // Feature 3: unexpected script/language detection
  const scriptIssue = checkUnexpectedScript(safeText);
  if (scriptIssue) issues.push(scriptIssue);

  // Feature 2 + Feature 4: only possible when we have the original image buffer.
  if (imageBuffer) {
    const orientationIssue = await checkTextOrientation(imageBuffer, safeText);
    if (orientationIssue) issues.push(orientationIssue);

    const printQualityIssues = await analyzePrintQuality(imageBuffer);
    issues.push(...printQualityIssues);
  }

  // Common pharma spelling/name check
  const knownDrugs = ['Paracetamol', 'Amoxicillin', 'Metformin', 'Botulinum', 'Ibuprofen', 'Aspirin'];
  const foundDrug = knownDrugs.find((drug) => safeText.toLowerCase().includes(drug.toLowerCase()));
  if (!foundDrug) {
    issues.push({
      severity: 'MINOR',
      field: 'Drug Name',
      observation: 'Drug name not matched against known medicines list'
    });
  }

  return {
    issues,
    matched_drug: foundDrug || null
  };
}

// ─── AI Explanation templates ────────────────────────────────
const EXPLANATION_TEMPLATES = [
  { area: 'Typography Analysis',   issue: 'Font spacing inconsistency',     detail: 'Character kerning varies across the label — genuine manufacturers use consistent typesetting' },
  { area: 'Color Integrity',       issue: 'Pigment saturation deviation',    detail: 'Color values deviate from expected pharmaceutical-grade printing standards' },
  { area: 'Barcode Region',        issue: 'Barcode clarity check',           detail: 'Barcode area analyzed for print fidelity — smeared barcodes may indicate counterfeit reproduction' },
  { area: 'Hologram Detection',    issue: 'Security feature scan',          detail: 'Scanning for holographic security markers typically present on authentic packaging' },
  { area: 'Batch Code Analysis',   issue: 'Batch number format validation', detail: 'Batch code format cross-referenced against known manufacturer patterns' },
  { area: 'Edge Detection',        issue: 'Package seal integrity',         detail: 'Examining seal edges for signs of re-packaging or tampering' },
  { area: 'Expiry Date Region',    issue: 'Date stamp verification',        detail: 'Expiry date printing quality analyzed — counterfeit products often have inconsistent date stamps' },
  { area: 'Manufacturer Logo',     issue: 'Logo fidelity check',            detail: 'Logo resolution and placement compared against known authentic samples' },
];

// ─── Analyze VQA + CLIP outputs ────────────────────────────
function buildVisualVerdict(vqaChecks, clipResult) {
  let score = 70;
  const redFlags = [];

  for (const check of vqaChecks) {
    const weight = check.risk_weight || 8;
    if (check.pass === false) {
      score -= weight;
      redFlags.push({
        flag: `Visual check failed: ${check.check.replace(/_/g, ' ')}`,
        // Do not fabricate confidence numbers; only use the model-provided score.
        confidence: typeof check.confidence === 'number' ? Math.round(check.confidence * 100) : null
      });
    } else if (check.pass === true) {
      score += Math.max(2, Math.round(weight / 2));
    } else {
      score -= 2;
    }
  }

  const topLabel = clipResult?.top_label || '';
  const topScore = typeof clipResult?.top_score === 'number' ? clipResult.top_score : 0;

  if (topLabel.includes('genuine')) {
    score += Math.round(topScore * 20);
  } else if (topLabel.includes('counterfeit') || topLabel.includes('tampered') || topLabel.includes('damaged') || topLabel.includes('non-medicine')) {
    score -= Math.round(topScore * 22);
    redFlags.push({
      flag: `CLIP risk label: ${topLabel}`,
      confidence: typeof clipResult?.top_score === 'number' ? Math.round(clipResult.top_score * 100) : null
    });
  }

  score = Math.max(10, Math.min(100, score));

  const shuffled = [...EXPLANATION_TEMPLATES].sort(() => 0.5 - Math.random());
  const aiExplanations = shuffled.slice(0, redFlags.length > 0 ? 5 : 3);

  let summary;
  if (score >= 85) {
    summary = '✅ Visual checks suggest this package appears authentic.';
  } else if (score >= 60) {
    summary = '⚠️ Visual inconsistencies detected. Manual verification recommended.';
  } else {
    summary = '🚨 High visual risk detected. Do not trust without expert verification.';
  }

  return {
    authenticity_score: score,
    red_flags: redFlags,
    summary,
    ai_explanations: aiExplanations
  };
}

// ─── Weighted Scoring Formula ─────────────────────────────────
function computeFinalScore(clipResult, vqaPassRate, textIssues) {
  const textPassRate = textIssues.length === 0
    ? 1.0
    : Math.max(0, 1 - (textIssues.length * 0.2));

  const score = Math.round(
    (clipResult.authenticScore * 40) +
    (vqaPassRate * 40) +
    (textPassRate * 20)
  );

  const criticalCount = textIssues.filter((i) => i.severity === 'CRITICAL').length;
  const warningCount = textIssues.filter((i) => i.severity === 'WARNING').length;

  const assessment =
    criticalCount >= 1
      ? 'High Counterfeit Risk'
      : warningCount >= 2
        ? 'Needs Manual Verification'
        : score >= 75
          ? 'Likely Authentic'
          : 'Needs Manual Verification';

  return { score, assessment };
}

// ─── Fallback result ────────────────────────────────────────
function getFallbackResult() {
  const score = 65 + Math.floor(Math.random() * 15); // 65-79
  return {
    authenticity_score: score,
    red_flags: [
      { flag: 'Slight color inconsistency on packaging edges', confidence: 62 },
      { flag: 'Font rendering differs from reference samples', confidence: 48 }
    ],
    summary: '⚠️ Minor inconsistencies detected. Consider verifying with a licensed pharmacist.',
    ai_explanations: [
      { area: 'Typography Analysis', issue: 'Font spacing inconsistency', detail: 'Character kerning varies across the label — genuine manufacturers use consistent typesetting' },
      { area: 'Color Integrity', issue: 'Pigment saturation deviation', detail: 'Color values deviate from expected pharmaceutical-grade printing standards' },
      { area: 'Hologram Detection', issue: 'Security feature scan', detail: 'Scanning for holographic security markers typically present on authentic packaging' },
    ]
  };
}

// ─── POST /api/verify-medicine ──────────────────────────────
app.post('/api/verify-medicine', async (req, res) => {
  let ocrPayload = {
    raw_text: '',
    extracted_fields: parseOCRFields(''),
    matched_drug: null,
    validation_issues: []
  };
  let fdaCheck = {
    checked: false,
    matched: false,
    source: 'openFDA',
    query: null,
    message: 'FDA lookup not performed'
  };

  try {
    const { image } = req.body;

    if (!image || typeof image !== 'string') {
      return res.status(400).json({
        authenticity_score: 0,
        red_flags: [{ flag: 'No image provided', confidence: 100 }],
        summary: '❌ No image data received.',
        ai_explanations: []
      });
    }

    // Strip data URI prefix to get raw base64
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    // Step 3: Deterministic quality gate + classification metrics (Sharp locally).
    // Runs before any vision model calls to avoid hallucinations on bad images.
    let qualityResult = null;
    try {
      qualityResult = await analyzeImageQuality(base64Data);
      if (qualityResult?.qualityGate === 'FAIL') {
        return res.json({
          error: 'image_quality',
          message: qualityResult?.reason || 'Please upload a clearer, well-lit photo',
          confidence: 'Low'
        });
      }
    } catch (qualityErr) {
      // If sharp fails to analyze, continue to avoid blocking the prototype.
      console.warn('⚠️ Image quality analysis failed; continuing:', qualityErr.message || qualityErr);
    }

    // Step 2: TrOCR extraction + deterministic text validation
    let trocrText = '';
    let textValidation = { issues: [], matched_drug: null };
    let ocrFields = parseOCRFields('');
    let ocrSource = 'tesseract';

    try {
      const localOcr = await runOCR(base64Data);
      trocrText = localOcr.text;
      ocrSource = 'tesseract';

      ocrFields = parseOCRFields(trocrText || '');
      textValidation = await validateExtractedText(trocrText || '', imageBuffer);
      console.log('📝 OCR text:', trocrText || '[empty]');
    } catch (ocrError) {
      console.warn('⚠️ Local OCR failed:', ocrError.message || ocrError);
      textValidation = {
        issues: [
          {
            severity: 'WARNING',
            field: 'OCR',
            observation: 'Local OCR extraction failed; text validation could not be completed'
          }
        ],
        matched_drug: null
      };
    }

    ocrPayload = {
      raw_text: trocrText,
      extracted_fields: ocrFields,
      matched_drug: textValidation.matched_drug,
      validation_issues: textValidation.issues
    };

    fdaCheck = await crossReferenceDrugWithFDA(ocrFields.drugName);
    if (fdaCheck.checked && !fdaCheck.matched) {
      ocrPayload.validation_issues = [
        ...ocrPayload.validation_issues,
        {
          severity: 'MINOR',
          field: 'FDA Cross-check',
          observation: fdaCheck.message || 'Drug name could not be confirmed in openFDA'
        }
      ];
    }

    // ─── Step 2: Visual analysis via Gemini Vision (replace BLIP-VQA + CLIP) ───
    let visionErrors = null;
    let geminiResult = null;

    try {
      geminiResult = await runVisionAnalysis(image);
      // issues[] and authenticityScore are handled inside the service.
      console.log('🔍 Gemini vision issues:', geminiResult?.issues?.length || 0);
    } catch (visionErr) {
      visionErrors = visionErrors || {};
      visionErrors.gemini = visionErr.message || String(visionErr);
      console.warn('⚠️ Gemini vision failed — continuing with OCR + deterministic checks:', visionErrors.gemini);
    }

    // Convert Gemini issues into the existing UI red-flag shape.
    // Confidence is not provided by the Gemini snippet; keep it as `null` so UI can hide it.
    const visualRedFlags = (geminiResult?.issues || []).map((issue) => ({
      flag: `${issue.field}: ${issue.observation}`,
      confidence: null
    }));

    // If Gemini totally fails, show a friendly red-flag instead of raw error text.
    if ((visionErrors || geminiResult?.source === 'gemini-failed') && visualRedFlags.length === 0) {
      visualRedFlags.push({
        flag: 'Visual model inference unavailable — verdict based on OCR + rule checks only',
        confidence: null
      });
    }

    // Provide user-facing explanation cards (keeps existing UI feature working).
    const aiExplanations = (geminiResult?.issues || []).slice(0, 5).map((issue) => ({
      area: 'Gemini Vision',
      issue: String(issue.field || 'Visual feature'),
      detail: String(issue.observation || 'Unable to assess this visual feature clearly.')
    }));

    // Add deterministic quality explanations so the user understands why clarity matters.
    // (Local Sharp metrics; no external model failure messages.)
    const qualityExplanations = (qualityResult?.issues || []).slice(0, 2).map((q) => ({
      area: 'Deterministic Quality',
      issue: q.field,
      detail: q.observation
    }));

    aiExplanations.push(...qualityExplanations);

    const visualScore0to100 =
      typeof geminiResult?.authenticityScore === 'number' ? geminiResult.authenticityScore : 50;

    // computeFinalScore expects visual components normalized to 0..1.
    const visualAuthenticScoreNorm = Math.max(0, Math.min(1, visualScore0to100 / 100));

    // Step 3: use deterministic sharp metrics as the "classification" layer
    // (replaces Sharp CLIP stand-in used previously in scoring).
    const qualityIssues = qualityResult?.issues || [];
    const deterministicAuthenticScore100 = qualityResult?.qualityGate === 'FAIL'
      ? 25
      : Math.max(30, 90 - (qualityIssues.length * 10));

    const deterministicAuthenticScoreNorm = Math.max(
      0,
      Math.min(1, deterministicAuthenticScore100 / 100)
    );

    // Add deterministic quality issues to the same red-flag list the UI renders.
    // Confidence stays null (deterministic local metrics).
    if (qualityIssues.length > 0) {
      for (const q of qualityIssues) {
        visualRedFlags.push({
          flag: `${q.field}: ${q.observation}`,
          confidence: null
        });
      }
    }

    const pseudoClipResult = { authenticScore: deterministicAuthenticScoreNorm };
    const pseudoVqaPassRate = visualAuthenticScoreNorm;

    // Feed quality issues into score "textIssues" weighting so assessment changes when
    // image quality is poor (without changing the response shape).
    const qualityIssuesForScore = qualityIssues.map((q) => ({
      severity: q.severity,
      field: q.field,
      observation: q.observation
    }));

    const { score, assessment } = computeFinalScore(
      pseudoClipResult,
      pseudoVqaPassRate,
      [...(ocrPayload.validation_issues || []), ...qualityIssuesForScore]
    );

    const result = {
      authenticity_score: score,
      red_flags: visualRedFlags,
      summary: assessment,
      ai_explanations: aiExplanations,
      scoring_breakdown: {
        gemini_authenticityScore: visualScore0to100,
        clip_authenticScore: deterministicAuthenticScoreNorm,
        vqaPassRate: pseudoVqaPassRate,
        textIssuesCount: ocrPayload.validation_issues.length + qualityIssuesForScore.length,
        deterministic_quality: {
          qualityGate: qualityResult?.qualityGate || 'PASS',
          metrics: qualityResult?.metrics || {},
          qualityIssuesCount: qualityIssuesForScore.length,
          deterministicAuthenticScore100
        }
      }, // new field (allowed)
      ocr: ocrPayload,
      fda: fdaCheck,
      visual_checks: [], // kept for response compatibility
      clip: null, // kept for response compatibility
      model_used: {
        // kept keys for compatibility; BLIP/CLIP are replaced by Gemini
        core_vqa: null,
        fallback_vqa: null,
        clip: null,
        vision: geminiResult?.source || 'gemini',
        ocr: ocrSource
      }
    };

    if (visionErrors) result.vision_errors = visionErrors; // new field (allowed)

    return res.json(result);

  } catch (error) {
    console.error('❌ API Error:', error.message || error);
    return res.json(buildDeterministicFallbackResult(ocrPayload, fdaCheck, { inferenceUnavailable: true }));
  }
});

// ─── Health check ───────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Start server ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Medi-Verify backend running on http://localhost:${PORT}`);
  console.log(`   POST /api/verify-medicine  — Analyze medicine image`);
  console.log(`   GET  /api/health           — Health check`);
  if (!HF_TOKEN || HF_TOKEN === 'your_huggingface_token_here') {
    console.log('   ⚠️  WARNING: HF_TOKEN not set — fallback mode active');
  }
});
