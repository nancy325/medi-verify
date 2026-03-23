// services/quality.service.js
const sharp = require('sharp');

// Deterministic, local image quality + print metrics.
// This is used as the "classification" layer (Step 3).
async function analyzeImageQuality(imageBase64) {
  const buffer = Buffer.from(
    String(imageBase64 || '').replace(/^data:image\/\w+;base64,/, ''),
    'base64'
  );

  const [stats, meta] = await Promise.all([
    sharp(buffer).stats(),
    sharp(buffer).metadata()
  ]);

  const issues = [];
  const metrics = {};

  // 1. Image too small to analyze
  metrics.width = meta?.width;
  metrics.height = meta?.height;
  if ((meta?.width || 0) < 200 || (meta?.height || 0) < 200) {
    return {
      qualityGate: 'FAIL',
      reason: 'Image too small — minimum 200x200px required',
      metrics
    };
  }

  // Guard: stats.channels may vary by format/sharp version.
  const channels = Array.isArray(stats?.channels) ? stats.channels : [];

  // 2. Image too dark
  const brightnessValues = channels
    .map((c) => (typeof c?.mean === 'number' ? c.mean : null))
    .filter((v) => v !== null);

  const avgBrightness = brightnessValues.length
    ? brightnessValues.reduce((a, b) => a + b, 0) / brightnessValues.length
    : 0;

  metrics.brightness = Math.round(avgBrightness);
  if (avgBrightness < 30) {
    return {
      qualityGate: 'FAIL',
      reason: 'Image too dark — please use better lighting',
      metrics
    };
  }

  // 3. Image too blurry (low entropy = blurry)
  metrics.entropy = typeof stats?.entropy === 'number' ? stats.entropy : 0;
  if (metrics.entropy < 4.5) {
    return {
      qualityGate: 'FAIL',
      reason: 'Image too blurry — please upload a clearer photo',
      metrics
    };
  }

  // 4. Print color faded (low std = washed out)
  const stdValues = channels
    .map((c) => {
      if (typeof c?.std === 'number') return c.std;
      if (typeof c?.stddev === 'number') return c.stddev;
      if (typeof c?.stdDev === 'number') return c.stdDev;
      return null;
    })
    .filter((v) => v !== null);

  const avgStd = stdValues.length
    ? stdValues.reduce((a, b) => a + b, 0) / stdValues.length
    : null;

  if (typeof avgStd === 'number') {
    metrics.colorVariance = Math.round(avgStd);
    if (avgStd < 20) {
      issues.push({
        severity: 'WARNING',
        field: 'Print Color',
        observation: 'Low color variance — print may be faded'
      });
    }
  } else {
    metrics.colorVariance = null;
  }

  return {
    qualityGate: 'PASS',
    issues,
    metrics
  };
}

module.exports = { analyzeImageQuality };

