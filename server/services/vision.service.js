// services/vision.service.js
// Gemini Vision API — primary visual analysis provider.
// Exports both the raw runner and a safe wrapper for fallback logic.

const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Guard: only create the client if key is present
let model = null;
if (GEMINI_API_KEY) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: 'Gemini 2.5 Flash' });
}

const VISION_PROMPT = `
You are a pharmaceutical packaging forensics analyst.
Analyze this medicine packaging image for authenticity.

Check these visual features only (no text reading):
1. Hologram/security seal — present and undamaged?
2. Logo — sharp, properly aligned, not pixelated?
3. Print quality — color uniform, not faded or patchy?
4. Tampering — torn edges, resealing marks, damage?
5. Overall print — looks professionally manufactured?

Rules:
- Report ONLY what is directly visible
- If not clearly visible, say "not visible"
- Mark each as PASS, ISSUE, or UNCLEAR
- No medical advice

Return ONLY this JSON (no markdown, no explanation):
{
  "hologram":    { "status": "PASS|ISSUE|UNCLEAR", "detail": "..." },
  "logo":        { "status": "PASS|ISSUE|UNCLEAR", "detail": "..." },
  "printQuality":{ "status": "PASS|ISSUE|UNCLEAR", "detail": "..." },
  "tampering":   { "status": "PASS|ISSUE|UNCLEAR", "detail": "..." },
  "overall":     { "status": "PASS|ISSUE|UNCLEAR", "detail": "..." },
  "authenticityScore": <0-100 based on visual evidence only>
}`;

/**
 * Raw Gemini Vision call — may throw on API errors.
 */
async function runVisionAnalysis(imageBase64) {
  if (!model) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // Strip data URL prefix if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  // Detect image type
  const mimeType = imageBase64.startsWith('data:image/png')
    ? 'image/png'
    : 'image/jpeg';

  const result = await model.generateContent([
    VISION_PROMPT,
    {
      inlineData: {
        data: base64Data,
        mimeType: mimeType
      }
    }
  ]);

  const raw = result.response.text().trim();

  // Strip markdown code fences if Gemini wraps output
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  const parsed = JSON.parse(cleaned);

  // Convert to issue format
  const issues = [];
  Object.entries(parsed).forEach(([key, val]) => {
    if (key === 'authenticityScore') return;
    if (!val || typeof val.status !== 'string') return;
    if (val.status === 'PASS') return;

    const isUnclear = val.status === 'UNCLEAR';
    issues.push({
      severity: isUnclear
        ? 'WARNING'
        : (key === 'hologram' || key === 'tampering' ? 'CRITICAL' : 'WARNING'),
      field: key,
      observation: val.detail
    });
  });

  return {
    issues,
    authenticityScore: parsed.authenticityScore || 50,
    visual_score: parsed.authenticityScore || 50,
    visual_flags: issues.map((i) => `${i.field}: ${i.observation}`),
    rawResponse: parsed,
    source: 'gemini'
  };
}

/**
 * Safe wrapper — never throws. Returns a success/failure envelope.
 * Detects quota, rate-limit, and network errors.
 *
 * @param {string} imageBase64 — base64 image (with or without data URI prefix)
 * @returns {Promise<{ success: boolean, data?: object, error?: string, source: string }>}
 */
async function safeGeminiAnalysis(imageBase64) {
  try {
    const data = await runVisionAnalysis(imageBase64);
    return { success: true, data, source: 'gemini' };
  } catch (err) {
    const msg = err?.message || String(err);
    const status = err?.response?.status || err?.status;

    // Classify the error for logging
    let errorType = 'unknown';
    if (status === 429 || /rate.?limit|quota.?exceeded|resource.?exhausted/i.test(msg)) {
      errorType = 'rate_limit';
    } else if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network/i.test(msg)) {
      errorType = 'network';
    } else if (/api.?key|auth|permission|GEMINI_API_KEY/i.test(msg)) {
      errorType = 'auth';
    } else if (/JSON|parse|Unexpected/i.test(msg)) {
      errorType = 'parse';
    }

    console.warn(`⚠️ Gemini vision failed [${errorType}]:`, msg);

    return {
      success: false,
      error: msg,
      errorType,
      source: 'gemini'
    };
  }
}

module.exports = { runVisionAnalysis, safeGeminiAnalysis };
