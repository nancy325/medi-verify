// services/sharp-fallback.service.js
// Sharp-based deterministic fallback when LLaVA is unavailable.
// Provides basic image quality metrics as a proxy for packaging analysis.

const sharp = require("sharp");

async function runSharpFallback(imageBase64) {
  console.log("🔷 Running Sharp fallback analysis...");

  try {
    const buffer = Buffer.from(
      imageBase64.replace(
        /^data:image\/(png|jpeg|jpg|webp);base64,/, ""
      ),
      "base64"
    );

    const [stats, meta] = await Promise.all([
      sharp(buffer).stats(),
      sharp(buffer).metadata()
    ]);

    const issues = [];

    // Check 1 — color variance (faded print detection)
    const channels = Array.isArray(stats?.channels) ? stats.channels : [];
    const stdValues = channels
      .map(c => (typeof c?.std === "number" ? c.std : null))
      .filter(v => v !== null);
    const avgStd = stdValues.length
      ? stdValues.reduce((a, b) => a + b, 0) / stdValues.length
      : 0;

    if (avgStd < 20) {
      issues.push({
        severity:    "WARNING",
        field:       "printColor",
        observation: "Low color variance detected — " +
                     "print may be faded or washed out",
        source:      "sharp-fallback"
      });
    }

    // Check 2 — sharpness via entropy
    if (typeof stats?.entropy === "number" && stats.entropy < 6.0) {
      issues.push({
        severity:    "WARNING",
        field:       "printSharpness",
        observation: "Low image sharpness detected — " +
                     "text details may be unclear",
        source:      "sharp-fallback"
      });
    }

    // Check 3 — brightness (too dark = poor quality scan)
    const meanValues = channels
      .map(c => (typeof c?.mean === "number" ? c.mean : null))
      .filter(v => v !== null);
    const avgBrightness = meanValues.length
      ? meanValues.reduce((a, b) => a + b, 0) / meanValues.length
      : 128;

    if (avgBrightness < 40) {
      issues.push({
        severity:    "WARNING",
        field:       "imageBrightness",
        observation: "Image appears dark — " +
                     "packaging details may be obscured",
        source:      "sharp-fallback"
      });
    }

    // Penalized score — Sharp fallback is less reliable
    // than LLaVA so we apply a penalty and cap at 60
    const baseScore = Math.max(
      0,
      60 - (issues.length * 10)
    );

    console.log(`🔷 Sharp fallback: ${issues.length} issues, score ${baseScore}`);

    return {
      issues,
      authenticityScore: baseScore,
      source:            "sharp-fallback",
      success:           true,
      penalized:         true,   // flag that this is fallback
      penaltyReason:     "LLaVA unavailable — " +
                         "visual analysis is limited"
    };

  } catch (err) {
    console.error("❌ Sharp fallback failed:", err.message);

    // Last resort — return neutral score with warning
    return {
      issues: [{
        severity:    "WARNING",
        field:       "visualAnalysis",
        observation: "Visual analysis unavailable — " +
                     "manual verification recommended",
        source:      "no-vision"
      }],
      authenticityScore: 50,
      source:            "no-vision",
      success:           false,
      penalized:         true,
      penaltyReason:     "All visual analysis failed"
    };
  }
}

module.exports = { runSharpFallback };
