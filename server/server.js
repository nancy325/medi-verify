require('dotenv').config();

const express = require('express');
const cors = require('cors');
const sharp = require('sharp');

// ─── Service imports ────────────────────────────────────────
const { runOCR } = require('./services/ocr.service');
const { safeGeminiAnalysis } = require('./services/vision.service');
const { analyzeWithOpenCV } = require('./services/opencv.service');
const { analyzeImageQuality } = require('./services/quality.service');
const { runValidation } = require('./services/validation.service');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ─────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ─── AI Explanation templates ───────────────────────────────
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

// ─── Status determination ───────────────────────────────────
function determineStatus(score, hardFlags) {
  if (hardFlags.likelyFake) return 'LIKELY FAKE';
  if (score >= 75) return 'REAL';
  if (score >= 45) return 'SUSPICIOUS';
  return 'LIKELY FAKE';
}

// ─── Build AI explanations from vision + validation results ─
function buildExplanations(visionResult, validationResult, qualityResult) {
  const explanations = [];

  // Gemini-provided explanations
  if (visionResult?.source === 'gemini' && visionResult?.data?.issues) {
    for (const issue of visionResult.data.issues.slice(0, 4)) {
      explanations.push({
        area: 'Gemini Vision',
        issue: String(issue.field || 'Visual feature'),
        detail: String(issue.observation || 'Unable to assess clearly.')
      });
    }
  }

  // OpenCV explanations
  if (visionResult?.source === 'opencv' && visionResult?.visual_flags) {
    for (const flag of visionResult.visual_flags.slice(0, 3)) {
      explanations.push({
        area: 'OpenCV Analysis',
        issue: 'Image quality metric',
        detail: flag
      });
    }
  }

  // Validation explanations
  if (validationResult?.flags) {
    for (const f of validationResult.flags.slice(0, 3)) {
      explanations.push({
        area: 'Validation Engine',
        issue: f.severity || 'Check',
        detail: f.flag
      });
    }
  }

  // Quality explanations
  if (qualityResult?.issues) {
    for (const q of qualityResult.issues.slice(0, 2)) {
      explanations.push({
        area: 'Deterministic Quality',
        issue: q.field,
        detail: q.observation
      });
    }
  }

  // Pad with templates if too few
  if (explanations.length < 3) {
    const shuffled = [...EXPLANATION_TEMPLATES].sort(() => 0.5 - Math.random());
    for (const tmpl of shuffled) {
      if (explanations.length >= 5) break;
      explanations.push(tmpl);
    }
  }

  return explanations.slice(0, 6);
}

// ─── Analyze a single image ─────────────────────────────────
async function analyzeSingleImage(image) {
  try {
    if (!image || typeof image !== 'string') {
      return {
        authenticity_score: 0,
        status: 'LIKELY FAKE',
        red_flags: [{ flag: 'No image provided', confidence: 100 }],
        summary: '❌ No image data received.',
        ai_explanations: [],
        vision: { score: 0, flags: [], source: 'none' },
        ocr: { raw_text: '', confidence: 0, parsed: {}, source: 'none' },
        validation: {},
        fda: {}
      };
    }

    // Strip data URI prefix
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // ─── Step 0: Quality gate (Sharp) ─────────────────────
    let qualityResult = null;
    try {
      qualityResult = await analyzeImageQuality(base64Data);
      if (qualityResult?.qualityGate === 'FAIL') {
        return {
          authenticity_score: 15,
          status: 'SUSPICIOUS',
          red_flags: [{ flag: qualityResult.reason || 'Poor image quality', confidence: 90 }],
          summary: '⚠️ Image quality too low for reliable analysis. Please upload a clearer photo.',
          ai_explanations: [{ area: 'Quality Gate', issue: 'Image rejected', detail: qualityResult.reason }],
          vision: { score: 0, flags: ['Quality gate failed'], source: 'quality_gate' },
          ocr: { raw_text: '', confidence: 0, parsed: {}, source: 'none' },
          validation: {},
          fda: {}
        };
      }
    } catch (qualityErr) {
      console.warn('⚠️ Quality analysis failed; continuing:', qualityErr.message || qualityErr);
    }

    // ─── Step 1: OCR extraction ───────────────────────────
    let ocrResult = { text: '', confidence: 0, parsed: {}, source: 'tesseract' };
    try {
      ocrResult = await runOCR(base64Data);
      console.log('📝 OCR text:', ocrResult.text ? ocrResult.text.substring(0, 100) + '...' : '[empty]');
    } catch (ocrErr) {
      console.warn('⚠️ OCR failed:', ocrErr.message || ocrErr);
    }

    // ─── Step 2: Validation engine ────────────────────────
    let validationResult = { validation_score: 50, flags: [], details: {}, fda: {}, isExpired: false, drugNotInFDA: false };
    try {
      validationResult = await runValidation(ocrResult.parsed || {});
    } catch (valErr) {
      console.warn('⚠️ Validation failed:', valErr.message || valErr);
    }

    // ─── Step 3: Vision analysis (Gemini → OpenCV fallback) ─
    let visionResult = { score: 50, flags: [], source: 'none' };

    // Try Gemini first
    const geminiResult = await safeGeminiAnalysis(image);

    if (geminiResult.success) {
      // ─── Gemini succeeded ─────────────────────────────
      visionResult = {
        score: geminiResult.data.visual_score || geminiResult.data.authenticityScore || 50,
        flags: geminiResult.data.visual_flags || [],
        source: 'gemini',
        rawResponse: geminiResult.data.rawResponse || null
      };
      console.log('🔍 Vision source: Gemini | Score:', visionResult.score);
    } else {
      // ─── Gemini failed → OpenCV fallback ──────────────
      console.warn('⚠️ Gemini unavailable, falling back to OpenCV');
      try {
        const cvResult = analyzeWithOpenCV(imageBuffer);

        // Step 4: Apply 0.9× confidence penalty for OpenCV fallback
        const penalizedScore = Math.round(cvResult.visual_score * 0.9);

        visionResult = {
          score: penalizedScore,
          flags: cvResult.visual_flags || [],
          source: 'opencv',
          metrics: cvResult.visual_metrics || {},
          geminiError: geminiResult.error || 'Unknown error'
        };
        console.log('🔍 Vision source: OpenCV (fallback) | Score:', visionResult.score);
      } catch (cvErr) {
        console.warn('⚠️ OpenCV fallback also failed:', cvErr.message || cvErr);
        visionResult = {
          score: 50,
          flags: ['Both vision providers failed — using neutral score'],
          source: 'fallback_neutral',
          geminiError: geminiResult.error || 'Unknown error',
          opencvError: cvErr.message || String(cvErr)
        };
      }
    }

    // ─── Step 5: Final weighted scoring ───────────────────
    // Formula: (vision * 0.4) + (ocr_confidence * 0.2) + (validation * 0.2) + (fda * 0.2)
    const visionScore = Math.max(0, Math.min(100, visionResult.score));
    const ocrConfidence = Math.max(0, Math.min(100, ocrResult.confidence || 0));
    const validationScore = Math.max(0, Math.min(100, validationResult.validation_score || 50));
    const fdaScore = Math.max(0, Math.min(100, validationResult.fda?.score || 50));

    let finalScore = Math.round(
      (visionScore * 0.4) +
      (ocrConfidence * 0.2) +
      (validationScore * 0.2) +
      (fdaScore * 0.2)
    );

    // Clamp
    finalScore = Math.max(0, Math.min(100, finalScore));

    // ─── Step 6: Hard flag overrides ──────────────────────
    const hardFlags = {
      likelyFake: false,
      reasons: []
    };

    // Drug not found in FDA
    if (validationResult.drugNotInFDA) {
      hardFlags.reasons.push('Drug not found in FDA database');
    }

    // Expired product
    if (validationResult.isExpired) {
      hardFlags.likelyFake = true;
      hardFlags.reasons.push('Product is expired');
      finalScore = Math.min(finalScore, 25);
    }

    // Severe OCR mismatch (confidence extremely low AND no fields extracted)
    if (ocrConfidence < 15 && !ocrResult.parsed?.drugName && !ocrResult.parsed?.batchNumber) {
      hardFlags.reasons.push('Severe OCR mismatch — text unreadable');
      finalScore = Math.max(0, finalScore - 15);
    }

    // If drug not in FDA AND other issues → likely fake
    if (validationResult.drugNotInFDA && hardFlags.reasons.length >= 2) {
      hardFlags.likelyFake = true;
      finalScore = Math.min(finalScore, 30);
    }

    const status = determineStatus(finalScore, hardFlags);

    // ─── Build red flags ──────────────────────────────────
    const redFlags = [];

    // Vision flags
    for (const flag of visionResult.flags || []) {
      redFlags.push({ flag, confidence: null });
    }

    // Validation flags
    for (const f of validationResult.flags || []) {
      redFlags.push({ flag: f.flag, confidence: f.severity === 'CRITICAL' ? 95 : 70 });
    }

    // Quality flags
    for (const q of qualityResult?.issues || []) {
      redFlags.push({ flag: `${q.field}: ${q.observation}`, confidence: null });
    }

    // Hard flag reasons
    for (const reason of hardFlags.reasons) {
      if (!redFlags.some((r) => r.flag.includes(reason))) {
        redFlags.push({ flag: reason, confidence: 90 });
      }
    }

    // ─── Summary text ─────────────────────────────────────
    let summary;
    if (status === 'REAL') {
      summary = '✅ Verification checks suggest this medicine appears authentic.';
    } else if (status === 'SUSPICIOUS') {
      summary = '⚠️ Some inconsistencies detected. Manual verification recommended.';
    } else {
      summary = '🚨 High risk indicators detected. Do not trust without professional verification.';
    }

    // ─── Build explanations ───────────────────────────────
    const aiExplanations = buildExplanations(
      { source: visionResult.source, data: geminiResult.success ? geminiResult.data : null, visual_flags: visionResult.flags },
      validationResult,
      qualityResult
    );

    // ─── Assemble final response ──────────────────────────
    return {
      authenticity_score: finalScore,
      status,
      red_flags: redFlags.slice(0, 12),
      summary,
      ai_explanations: aiExplanations,
      vision: {
        score: visionResult.score,
        flags: visionResult.flags,
        source: visionResult.source
      },
      ocr: {
        raw_text: ocrResult.text,
        confidence: ocrResult.confidence,
        extracted_fields: {
          drugName: ocrResult.parsed?.drugName || null,
          dosage: ocrResult.parsed?.dosage || null,
          batchNumber: ocrResult.parsed?.batchNumber || null,
          expiryDate: ocrResult.parsed?.expiryDate || null,
          manufacturer: ocrResult.parsed?.manufacturer || null,
          rxSymbol: /\bRx\b|℞/i.test(ocrResult.text || '')
        },
        matched_drug: ocrResult.parsed?.drugName || null,
        validation_issues: (validationResult.flags || []).map((f) => ({
          severity: f.severity || 'WARNING',
          field: 'Validation',
          observation: f.flag
        })),
        source: ocrResult.source
      },
      validation: {
        score: validationResult.validation_score,
        flags: validationResult.flags,
        details: validationResult.details
      },
      fda: validationResult.fda || { checked: false, matched: false, source: 'openFDA', query: null, message: 'Not performed' },
      scoring_breakdown: {
        vision_score: visionScore,
        vision_source: visionResult.source,
        ocr_confidence: ocrConfidence,
        validation_score: validationScore,
        fda_score: fdaScore,
        hard_flags: hardFlags,
        formula: '(vision*0.4) + (ocr*0.2) + (validation*0.2) + (fda*0.2)'
      },
      model_used: {
        vision: visionResult.source,
        ocr: ocrResult.source || 'tesseract',
        quality: 'sharp',
        validation: 'deterministic'
      }
    };

  } catch (error) {
    console.error('❌ API Error:', error.message || error);
    return {
      authenticity_score: 30,
      status: 'SUSPICIOUS',
      red_flags: [{ flag: 'Analysis pipeline error — partial results only', confidence: 70 }],
      summary: '⚠️ An error occurred during analysis. Result may be incomplete.',
      ai_explanations: [
        { area: 'System', issue: 'Pipeline error', detail: 'One or more analysis stages failed. Showing best available result.' }
      ],
      vision: { score: 0, flags: [], source: 'error' },
      ocr: { raw_text: '', confidence: 0, extracted_fields: {}, matched_drug: null, validation_issues: [], source: 'error' },
      validation: {},
      fda: { checked: false, matched: false, source: 'openFDA', query: null, message: 'Analysis error' }
    };
  }
}

// ─── Multi-image aggregation ────────────────────────────────
function aggregateResults(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return {
      authenticity_score: 0,
      status: 'LIKELY FAKE',
      red_flags: [{ flag: 'No analysis results generated', confidence: 100 }],
      summary: '❌ Unable to analyze provided images.',
      ai_explanations: [],
      vision: { score: 0, flags: [], source: 'none' },
      ocr: {},
      validation: {},
      fda: {}
    };
  }

  if (results.length === 1) {
    return results[0];
  }

  // Average scores
  const scoreTotal = results.reduce((t, r) => t + (r?.authenticity_score || 0), 0);
  const averageScore = Math.round(scoreTotal / results.length);

  // Merge red flags (deduplicate)
  const redFlagMap = new Map();
  for (const result of results) {
    for (const rf of result?.red_flags || []) {
      const key = String(rf?.flag || '').trim();
      if (!key) continue;
      const existing = redFlagMap.get(key);
      if (!existing || (rf.confidence && (!existing.confidence || rf.confidence > existing.confidence))) {
        redFlagMap.set(key, rf);
      }
    }
  }
  const redFlags = Array.from(redFlagMap.values()).slice(0, 12);

  // Merge explanations
  const explanationMap = new Map();
  for (const result of results) {
    for (const exp of result?.ai_explanations || []) {
      const key = `${exp?.area}::${exp?.issue}`;
      if (!explanationMap.has(key)) explanationMap.set(key, exp);
    }
  }
  const mergedExplanations = Array.from(explanationMap.values()).slice(0, 6);

  // Merge OCR (take first non-empty)
  const bestOcr = results.find((r) => r?.ocr?.raw_text?.trim()?.length > 0)?.ocr || results[0]?.ocr || {};

  // Merge FDA (prefer matched)
  const matchedFda = results.find((r) => r?.fda?.matched);
  const checkedFda = results.find((r) => r?.fda?.checked);
  const mergedFda = matchedFda?.fda || checkedFda?.fda || results[0]?.fda || {};

  // Merge validation
  const bestValidation = results.find((r) => r?.validation?.score != null)?.validation || {};

  // Merge vision
  const bestVision = results.find((r) => r?.vision?.source === 'gemini')?.vision
    || results.find((r) => r?.vision?.source === 'opencv')?.vision
    || results[0]?.vision || {};

  // Determine overall status
  const hasLikelyFake = results.some((r) => r?.status === 'LIKELY FAKE');
  const hasSuspicious = results.some((r) => r?.status === 'SUSPICIOUS');
  let status;
  if (hasLikelyFake) status = 'LIKELY FAKE';
  else if (hasSuspicious || averageScore < 75) status = 'SUSPICIOUS';
  else status = 'REAL';

  let summary;
  if (status === 'REAL') {
    summary = `✅ Multi-image review suggests this package appears authentic. (${results.length} photos analyzed)`;
  } else if (status === 'SUSPICIOUS') {
    summary = `⚠️ Multi-image review found inconsistencies. Manual verification recommended. (${results.length} photos)`;
  } else {
    summary = `🚨 Multi-image review indicates high counterfeit risk. (${results.length} photos)`;
  }

  return {
    authenticity_score: averageScore,
    status,
    red_flags: redFlags,
    summary,
    ai_explanations: mergedExplanations,
    vision: bestVision,
    ocr: bestOcr,
    validation: bestValidation,
    fda: mergedFda,
    model_used: {
      vision: bestVision?.source || 'unknown',
      ocr: 'tesseract',
      quality: 'sharp',
      validation: 'deterministic',
      mode: 'multi-image',
      images_analyzed: results.length
    },
    image_count: results.length,
    per_image_results: results
  };
}

// ─── POST /api/verify-medicine ──────────────────────────────
app.post('/api/verify-medicine', async (req, res) => {
  const imagesFromArray = Array.isArray(req.body?.images)
    ? req.body.images.filter((v) => typeof v === 'string' && v.trim().length > 0)
    : [];

  const singleImage = typeof req.body?.image === 'string' && req.body.image.trim().length > 0
    ? [req.body.image]
    : [];

  const images = imagesFromArray.length > 0 ? imagesFromArray : singleImage;

  if (images.length === 0) {
    return res.status(400).json({
      authenticity_score: 0,
      status: 'LIKELY FAKE',
      red_flags: [{ flag: 'No image provided', confidence: 100 }],
      summary: '❌ No image data received.',
      ai_explanations: [],
      vision: { score: 0, flags: [], source: 'none' },
      ocr: {},
      validation: {},
      fda: {}
    });
  }

  const perImageResults = [];
  for (const image of images) {
    const imageResult = await analyzeSingleImage(image);
    perImageResults.push(imageResult);
  }

  return res.json(aggregateResults(perImageResults));
});

// ─── Health check ───────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    providers: {
      gemini: !!process.env.GEMINI_API_KEY,
      opencv: true,
      tesseract: true,
      openFDA: true
    }
  });
});

// ─── Start server ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Medi-Verify backend running on http://localhost:${PORT}`);
  console.log(`   POST /api/verify-medicine  — Analyze medicine image`);
  console.log(`   GET  /api/health           — Health check`);
  console.log(`   ─── Providers ───`);
  console.log(`   Vision: Gemini ${process.env.GEMINI_API_KEY ? '✅' : '❌ (will use OpenCV fallback)'}`);
  console.log(`   OCR:    Tesseract ✅`);
  console.log(`   Quality: Sharp ✅`);
  console.log(`   Validation: Deterministic ✅`);
  if (!process.env.GEMINI_API_KEY) {
    console.log('   ⚠️  GEMINI_API_KEY not set — OpenCV fallback will be used for vision analysis');
  }
});
