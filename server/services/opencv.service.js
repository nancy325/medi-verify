// services/opencv.service.js
// Deterministic OpenCV-based image analysis (WASM — no native deps).
// Used as fallback when Gemini Vision API is unavailable.

const { cv } = require('opencv-wasm');
const sharp = require('sharp');

/**
 * Analyze an image buffer using OpenCV WASM for blur, edges, and brightness.
 * Uses Sharp to decode the image into raw RGBA pixels, then loads into cv.Mat.
 *
 * @param {Buffer} imageBuffer — raw image bytes (PNG/JPEG)
 * @returns {Promise<{ visual_score: number, visual_flags: string[], visual_metrics: { blur: number, edges: number, brightness: number } }>}
 */
async function analyzeWithOpenCV(imageBuffer) {
  // Decode image to raw RGBA pixel data using Sharp
  const { data: rawPixels, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;

  // Load raw RGBA pixels into an OpenCV Mat
  const mat = new cv.Mat(height, width, cv.CV_8UC4);
  mat.data.set(rawPixels);

  // Convert to grayscale for all metrics
  const gray = new cv.Mat();
  cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);

  // ─── 1. Blur detection (Laplacian variance) ──────────────
  const laplacian = new cv.Mat();
  cv.Laplacian(gray, laplacian, cv.CV_64F);

  const lapMean = new cv.Mat();
  const lapStdDev = new cv.Mat();
  cv.meanStdDev(laplacian, lapMean, lapStdDev);

  // Variance = stddev^2 — higher = sharper image
  const lapStd = lapStdDev.doubleAt(0, 0);
  const blurVariance = lapStd * lapStd;

  // ─── 2. Edge density (Canny) ─────────────────────────────
  const edges = new cv.Mat();
  cv.Canny(gray, edges, 50, 150);

  const totalPixels = edges.rows * edges.cols;
  const edgePixels = cv.countNonZero(edges);
  const edgeDensity = totalPixels > 0 ? (edgePixels / totalPixels) * 100 : 0;

  // ─── 3. Brightness (grayscale mean) ──────────────────────
  const brightMean = new cv.Mat();
  const brightStd = new cv.Mat();
  cv.meanStdDev(gray, brightMean, brightStd);
  const brightness = brightMean.doubleAt(0, 0); // 0–255

  // ─── Cleanup OpenCV mats ─────────────────────────────────
  mat.delete();
  gray.delete();
  laplacian.delete();
  lapMean.delete();
  lapStdDev.delete();
  edges.delete();
  brightMean.delete();
  brightStd.delete();

  // ─── Scoring logic ───────────────────────────────────────
  let score = 80; // start at 80, adjust based on metrics
  const flags = [];

  // Low blur variance → blurry image → reduce score
  if (blurVariance < 100) {
    score -= 25;
    flags.push('Image appears very blurry — low Laplacian variance');
  } else if (blurVariance < 500) {
    score -= 10;
    flags.push('Image sharpness is below average');
  }

  // Low edge density → lack of detail / possible blank / low-quality print
  if (edgeDensity < 2) {
    score -= 20;
    flags.push('Very low edge density — image lacks detail');
  } else if (edgeDensity < 5) {
    score -= 8;
    flags.push('Below-average edge density');
  }

  // Extreme brightness — too dark or too bright
  if (brightness < 40) {
    score -= 15;
    flags.push('Image is too dark for reliable analysis');
  } else if (brightness > 220) {
    score -= 12;
    flags.push('Image is overexposed / washed out');
  }

  // Clamp to 0–100
  score = Math.max(0, Math.min(100, score));

  return {
    visual_score: score,
    visual_flags: flags,
    visual_metrics: {
      blur: Math.round(blurVariance * 100) / 100,
      edges: Math.round(edgeDensity * 100) / 100,
      brightness: Math.round(brightness * 100) / 100
    }
  };
}

module.exports = { analyzeWithOpenCV };
