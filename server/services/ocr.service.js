// services/ocr.service.js
const Tesseract = require('tesseract.js');
const sharp = require('sharp');

// Local OCR fallback (no Hugging Face dependency).
// Returns a similar object shape so server can decide what to do next.
async function runOCR(imageBase64) {
  try {
    // Preprocess first — improves accuracy significantly
    const imageBuffer = Buffer.from(
      imageBase64.replace(/^data:image\/\w+;base64,/, ''),
      'base64'
    );

    const processedBuffer = await sharp(imageBuffer)
      .greyscale()
      .normalise()
      .sharpen()
      .toBuffer();

    const {
      data: { text, confidence }
    } = await Tesseract.recognize(processedBuffer, 'eng', {
      // Treat as sparse text — better for packaging
      tessedit_pageseg_mode: '11'
    });

    return {
      text: text.trim(),
      confidence, // 0-100, real score from Tesseract
      source: 'tesseract'
    };
  } catch (err) {
    console.error('OCR failed:', err.message || err);
    return { text: '', confidence: 0, source: 'tesseract' };
  }
}

module.exports = { runOCR };

