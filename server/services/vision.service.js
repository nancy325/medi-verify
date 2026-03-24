// services/vision.service.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const modelsToTry = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-2.0-flash-lite',
];

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

// Add this temporarily to vision.service.js
// BEFORE the generateContent call:
console.log("API Key exists:", !!process.env.GEMINI_API_KEY);
console.log("SDK version:", require('@google/generative-ai/package.json').version);

async function runVisionAnalysis(imageBase64) {
  try {
    // Strip data URL prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    // Detect image type
    const mimeType = imageBase64.startsWith('data:image/png')
      ? 'image/png'
      : 'image/jpeg';

    let parsed = null;
    let selectedModel = null;

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        console.log('Calling model:', modelName);

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
        parsed = JSON.parse(raw);
        selectedModel = modelName;
        break;
      } catch (modelErr) {
        console.warn(`Vision model failed (${modelName}):`, modelErr.message || modelErr);
      }
    }

    if (!parsed) {
      throw new Error(`All Gemini models failed: ${modelsToTry.join(', ')}`);
    }

    // Convert to your existing issue format
    const issues = [];

    Object.entries(parsed).forEach(([key, val]) => {
      if (key === 'authenticityScore') return;
      if (!val || typeof val.status !== 'string') return;

      // Treat PASS as no issue, but include UNCLEAR/ISSUE so the UI can guide manual review.
      if (val.status === 'PASS') return;

      const isUnclear = val.status === 'UNCLEAR';

      issues.push({
        severity:
          // If truly unclear, downgrade one level.
          isUnclear
            ? 'WARNING'
            : (key === 'hologram' || key === 'tampering' ? 'CRITICAL' : 'WARNING'),
        field: key,
        observation: val.detail
      });
    });

    return {
      issues,
      authenticityScore: parsed.authenticityScore || 50,
      rawResponse: parsed,
      source: selectedModel || 'gemini'
    };
  } catch (err) {
    console.error('Vision analysis failed:', err.message || err);

    // Graceful degradation — return empty, not crash
    return {
      issues: [],
      authenticityScore: 50,
      rawResponse: null,
      source: 'gemini-failed',
      error: err.message || String(err)
    };
  }
}

module.exports = { runVisionAnalysis };

