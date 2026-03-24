// services/ocr.service.js
// Adaptive OCR pipeline with stabilization + detection scoring.
// Fast → advanced fallback → top-N merge → keyword scoring → stable detection.

const Tesseract = require('tesseract.js');
const sharp = require('sharp');

// ═══════════════════════════════════════════════════════════
//  PHARMA KEYWORD SCORING
// ═══════════════════════════════════════════════════════════

const PHARMA_KEYWORDS = [
  'toxin', 'neuro', 'units', 'tablet', 'injection', 'capsule',
  'syrup', 'suspension', 'cream', 'ointment', 'gel', 'drops',
  'solution', 'powder', 'inhaler', 'patch', 'vial', 'ampoule',
  'pharmaceutical', 'pharma', 'medicine', 'drug', 'dosage',
  'composition', 'indication', 'excipient', 'sterile', 'antibiotic',
  'analgesic', 'antacid', 'antifungal', 'vitamin', 'supplement',
  'vaccine', 'prescription', 'generic', 'branded'
];

const CONTEXT_KEYWORDS = [
  'mg', 'mcg', 'ml', 'iu', 'lot', 'batch', 'exp', 'expiry',
  'mfg', 'mfd', 'manufactured', 'store', 'storage', 'keep',
  'protect', 'light', 'children', 'reach', 'doctor', 'pharmacist',
  'dose', 'daily', 'oral', 'topical', 'pack', 'strip'
];

function countPharmaKeywords(text) {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of PHARMA_KEYWORDS) { if (lower.includes(kw)) score++; }
  for (const kw of CONTEXT_KEYWORDS) { if (lower.includes(kw)) score += 0.5; }
  return score;
}

// ═══════════════════════════════════════════════════════════
//  PREPROCESSING
// ═══════════════════════════════════════════════════════════

async function preprocessAggressive(buffer) {
  const meta = await sharp(buffer).metadata();
  let p = sharp(buffer);
  if ((meta.width || 0) > 1200) p = p.resize({ width: 1024, withoutEnlargement: true });
  return p.greyscale().normalise().gamma(1.2).sharpen({ sigma: 1.5 }).threshold(160).toBuffer();
}

async function preprocessLight(buffer) {
  const meta = await sharp(buffer).metadata();
  let p = sharp(buffer);
  if ((meta.width || 0) > 1200) p = p.resize({ width: 1024, withoutEnlargement: true });
  return p.greyscale().normalise().sharpen().toBuffer();
}

// ═══════════════════════════════════════════════════════════
//  TESSERACT
// ═══════════════════════════════════════════════════════════

const TESS_CONFIG = {
  tessedit_pageseg_mode: '6',
  tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789./-:() %#',
};

async function ocrBuffer(buffer) {
  const { data: { text, confidence } } = await Tesseract.recognize(buffer, 'eng', TESS_CONFIG);
  return { text: (text || '').trim(), confidence: typeof confidence === 'number' ? confidence : 0 };
}

async function ocrRegion(rawBuffer) {
  const processed = await preprocessAggressive(rawBuffer);
  const result = await ocrBuffer(processed);
  if (result.confidence < 40 || result.text.length < 3) {
    const light = await preprocessLight(rawBuffer);
    const lr = await ocrBuffer(light);
    if (lr.confidence > result.confidence) return lr;
  }
  return result;
}

// ═══════════════════════════════════════════════════════════
//  TEXT NORMALIZATION
// ═══════════════════════════════════════════════════════════

function normalizeText(raw) {
  return raw.toLowerCase().replace(/[^\w\s.\/\-:(),%#@+]/g, '').replace(/\s+/g, ' ').trim();
}

function cleanLines(raw) {
  return raw
    .split('\n')
    .map((l) => l.replace(/[^\w\s.\/\-:(),%#@+®™℞]/g, '').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .join('\n');
}

// ═══════════════════════════════════════════════════════════
//  TOP-N MERGE (stabilization)
// ═══════════════════════════════════════════════════════════

function mergeTopResults(results, topN = 3) {
  const sorted = results
    .filter((r) => r.text.length >= 10 && r.confidence > 15)
    .sort((a, b) => b.confidence - a.confidence);

  const top = sorted.slice(0, topN);
  if (top.length === 0) return { text: '', confidence: 0 };

  const seen = new Set();
  const lines = [];
  for (const r of top) {
    for (const line of r.text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length < 4) continue; // ignore short tokens
      const key = normalizeText(trimmed);
      if (!seen.has(key)) { seen.add(key); lines.push(trimmed); }
    }
  }

  return { text: lines.join('\n'), confidence: top[0].confidence };
}

// ═══════════════════════════════════════════════════════════
//  STRUCTURED EXTRACTION
// ═══════════════════════════════════════════════════════════

function extractDrugName(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length >= 4);

  const skip = [
    /^\d+\.?\d*\s*(mg|mcg|ml|g|iu|units|µg)$/i,
    /^(LOT|BATCH|EXP|EXPIRY|USE BY|MFG|MFD|MANUFACTURED BY|STORE|KEEP|PROTECT)\b/i,
    /^\d+\s*(tablet|capsule|strip|pack)/i,
    /^(for|the|and|with|this|that|from|each|side|not|see)\b/i,
  ];

  const candidates = lines.filter((l) => !skip.some((p) => p.test(l)));
  if (candidates.length === 0) return 'Not clearly visible';

  // Score candidates by pharma relevance + position
  const scored = candidates.map((line, idx) => {
    const lower = line.toLowerCase();
    let s = 0;
    const words = lower.split(/\s+/).filter((w) => w.length >= 4);
    if (words.length >= 2) s += 2;
    for (const kw of PHARMA_KEYWORDS) { if (lower.includes(kw)) s += 1; }
    if (idx < 3) s += 1;
    if (/[A-Z][a-z]/.test(line)) s += 0.5;
    return { line, score: s };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 1) return 'Not clearly visible';

  const bestWords = best.line.split(/\s+/).filter((w) => w.length >= 4);
  if (bestWords.length === 0) return 'Not clearly visible';

  return best.line;
}

function extractExpiry(text) {
  const m = text.match(/\b(?:EXP|Exp|exp|EXPIRY|USE BY)?\.?\s*(\d{2})[\/\-](\d{2,4})\b/)
    || text.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})\b/i);
  return m ? m[0].trim() : null;
}

function extractBatch(text) {
  const m = text.match(/\b(?:LOT|Lot|lot|BATCH|Batch)[:\s#]?\s*([A-Z0-9\-]{4,14})\b/);
  return m ? m[1] : null;
}

function extractDosage(text) {
  const m = text.match(/\b(\d+\.?\d*)\s*(mg|mcg|ml|g|IU|UNITS|units|µg)\b/i);
  return m ? m[0] : null;
}

function extractManufacturer(text) {
  const m = text.match(/\b(?:Mfg|Mfd|Manufactured by|MANUFACTURED BY)[.:\s]+([^\n]+)/i);
  return m ? m[1].trim() : null;
}

function parseFields(text) {
  return {
    drugName: extractDrugName(text),
    expiryDate: extractExpiry(text),
    batchNumber: extractBatch(text),
    dosage: extractDosage(text),
    manufacturer: extractManufacturer(text)
  };
}

// ═══════════════════════════════════════════════════════════
//  DETECTION DECISION LOGIC
// ═══════════════════════════════════════════════════════════

function determineDetection(confidence, text) {
  const score = countPharmaKeywords(text);

  if (confidence > 55 && score >= 2) return 'Detected';
  if (confidence > 35 && score >= 1) return 'Possibly detected';
  return 'Not clearly visible';
}

// ═══════════════════════════════════════════════════════════
//  ADAPTIVE DECISION
// ═══════════════════════════════════════════════════════════

function isGoodOCR(result) {
  return result.confidence > 55 && (result.text || '').length > 30;
}

function hasValidData(parsed) {
  const name = parsed?.drugName;
  return name && name !== 'Not clearly visible';
}

// ═══════════════════════════════════════════════════════════
//  FAST OCR
// ═══════════════════════════════════════════════════════════

async function runFastOCR(imageBuffer) {
  const result = await ocrRegion(imageBuffer);
  const cleaned = cleanLines(result.text);
  const parsed = parseFields(cleaned);
  const detection = determineDetection(result.confidence, cleaned);
  return { text: cleaned, confidence: result.confidence, detection, parsed, ocr_mode: 'fast' };
}

// ═══════════════════════════════════════════════════════════
//  ADVANCED OCR
// ═══════════════════════════════════════════════════════════

const ROTATION_ANGLES = [0, 90, 180];

async function splitIntoGrid(imageBuffer) {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width || 0, h = meta.height || 0;
  if (w < 150 || h < 150) return [];
  const rW = Math.floor(w / 3), rH = Math.floor(h / 3);
  const regions = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const left = c * rW, top = r * rH;
      regions.push(await sharp(imageBuffer)
        .extract({ left, top, width: c === 2 ? w - left : rW, height: r === 2 ? h - top : rH })
        .toBuffer());
    }
  }
  return regions;
}

async function ocrWithRotations(rawBuffer) {
  let best = { text: '', confidence: 0 };
  for (const angle of ROTATION_ANGLES) {
    const rotated = angle === 0 ? rawBuffer : await sharp(rawBuffer).rotate(angle).toBuffer();
    const result = await ocrRegion(rotated);
    if (result.confidence > best.confidence && result.text.length > 2) best = result;
  }
  return best;
}

async function runAdvancedOCR(imageBuffer) {
  const regions = await splitIntoGrid(imageBuffer);
  const regionResults = await Promise.all(regions.map((buf) => ocrWithRotations(buf)));
  regionResults.push(await ocrRegion(imageBuffer));

  const merged = mergeTopResults(regionResults, 3);
  const cleaned = cleanLines(merged.text);
  const parsed = parseFields(cleaned);
  const detection = determineDetection(merged.confidence, cleaned);

  return { text: cleaned, confidence: merged.confidence, detection, parsed, ocr_mode: 'advanced' };
}

// ═══════════════════════════════════════════════════════════
//  MAIN ENTRY
// ═══════════════════════════════════════════════════════════

async function runOCR(imageBase64) {
  try {
    const rawBase64 = String(imageBase64 || '').replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(rawBase64, 'base64');

    // Step 1: Fast OCR
    const fast = await runFastOCR(imageBuffer);

    if (isGoodOCR(fast) && hasValidData(fast.parsed)) {
      console.log(`📝 OCR: fast | conf: ${fast.confidence} | detection: ${fast.detection}`);
      return fast;
    }

    // Step 2: Advanced OCR fallback
    console.log(`📝 Fast OCR weak (conf: ${fast.confidence}) → advanced`);
    try {
      const adv = await runAdvancedOCR(imageBuffer);
      if (adv.confidence > fast.confidence || adv.text.length > fast.text.length) {
        console.log(`📝 OCR: advanced | conf: ${adv.confidence} | detection: ${adv.detection}`);
        return adv;
      }
    } catch (e) {
      console.warn('⚠️ Advanced OCR failed:', e.message);
    }

    // Step 3: Best available
    console.log(`📝 OCR: fast (fallback) | conf: ${fast.confidence} | detection: ${fast.detection}`);
    return fast;

  } catch (err) {
    console.error('OCR pipeline failed:', err.message || err);
    return {
      text: '',
      confidence: 0,
      detection: 'Not clearly visible',
      parsed: { drugName: 'Not clearly visible', expiryDate: null, batchNumber: null, dosage: null, manufacturer: null },
      ocr_mode: 'fast'
    };
  }
}

module.exports = { runOCR };
