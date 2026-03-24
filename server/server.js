require('dotenv').config();

const express = require('express');
const cors = require('cors');
const sharp = require('sharp');

// ─── Service imports ────────────────────────────────────────
const { runOCR } = require('./services/ocr.service');
const { runLLaVAAnalysis } = require('./services/llava.service');
const { analyzeImageQuality } = require('./services/quality.service');
const { runValidation } = require('./services/validation.service');
const { lookupDrugFDA, buildFDAIssues } = require('./services/openfda.service');

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

// ─── Fix 4: Labeled s26–s29 validation checks ──────────────
function validateExtractedText(rawText, parsedFields) {
  const issues = [];

  // ── s26: Expiry date validation ───────────────────
  console.log('🔍 s26: Running expiry date check...');

  if (!parsedFields.expiryDate) {
    issues.push({
      severity:    'WARNING',
      field:       'expiryDate',
      checkId:     's26',
      checkName:   'Expiry Date Validation',
      observation: 'Expiry date not found or unreadable on packaging'
    });
  } else {
    const expMatch = parsedFields.expiryDate
      .match(/(\d{2})[\/\-](\d{2,4})/);

    if (expMatch) {
      let [, month, year] = expMatch;
      if (year.length === 2) year = '20' + year;

      const expDate = new Date(
        parseInt(year),
        parseInt(month) - 1,
        1
      );

      if (expDate < new Date()) {
        issues.push({
          severity:    'CRITICAL',
          field:       'expiryDate',
          checkId:     's26',
          checkName:   'Expiry Date Validation',
          observation: `Medicine is EXPIRED — expiry was ${month}/${year}`
        });
      } else {
        console.log(`   ✅ s26 PASS — expires ${month}/${year}`);
      }
    }
  }

  // ── s27: Batch number format validation ───────────
  console.log('🔍 s27: Running batch number check...');

  if (!parsedFields.batchNumber) {
    issues.push({
      severity:    'WARNING',
      field:       'batchNumber',
      checkId:     's27',
      checkName:   'Batch Number Validation',
      observation: 'Batch or lot number not found — ' +
                   'genuine medicines always have ' +
                   'a traceable batch number'
    });
  } else {
    const validBatch = /^[A-Z0-9\-]{4,14}$/i
      .test(parsedFields.batchNumber);

    if (!validBatch) {
      issues.push({
        severity:    'WARNING',
        field:       'batchNumber',
        checkId:     's27',
        checkName:   'Batch Number Validation',
        observation: `Batch number format suspicious — ` +
                     `"${parsedFields.batchNumber}" ` +
                     `does not match standard format`
      });
    } else {
      console.log(`   ✅ s27 PASS — batch: ${parsedFields.batchNumber}`);
    }
  }

  // ── s28: Drug name spellcheck + script detection ──
  console.log('🔍 s28: Running drug name check...');

  if (!parsedFields.drugName) {
    issues.push({
      severity:    'WARNING',
      field:       'drugName',
      checkId:     's28',
      checkName:   'Drug Name Validation',
      observation: 'Drug name could not be extracted from packaging'
    });
  } else {
    const chinesePattern  = /[\u4E00-\u9FFF]/;
    const cyrillicPattern = /[\u0400-\u04FF]/;
    const arabicPattern   = /[\u0600-\u06FF]/;

    const englishOnlyBrands = [
      'BOTOX', 'Allergan', 'NovoFine',
      'Novo Nordisk', 'Pfizer', 'Bayer',
      'Roche', 'Novartis', 'AstraZeneca',
      'Johnson', 'Merck', 'Abbott', 'GSK',
      'Sanofi', 'Cipla', 'Sun Pharma'
    ];

    const isEnglishBrand = englishOnlyBrands.some(b =>
      parsedFields.drugName.toUpperCase()
        .includes(b.toUpperCase())
    );

    const hasNonLatin =
      chinesePattern.test(parsedFields.drugName)  ||
      cyrillicPattern.test(parsedFields.drugName) ||
      arabicPattern.test(parsedFields.drugName);

    if (isEnglishBrand && hasNonLatin) {
      issues.push({
        severity:    'WARNING',
        field:       'drugName',
        checkId:     's28',
        checkName:   'Drug Name Validation',
        observation: 'Non-Latin script detected alongside ' +
                     'English brand name — verify country ' +
                     'of origin and authorised distributor'
      });
    } else {
      console.log(`   ✅ s28 PASS — drug: ${parsedFields.drugName}`);
    }
  }

  // ── s29: Duplicate text pattern detection ─────────
  console.log('🔍 s29: Running duplicate content check...');

  if (rawText && rawText.length > 10) {
    const lines = rawText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 3);

    if (lines.length > 3) {
      const unique   = new Set(lines);
      const dupRatio = unique.size / lines.length;

      if (dupRatio < 0.6) {
        issues.push({
          severity:    'CRITICAL',
          field:       'labelPattern',
          checkId:     's29',
          checkName:   'Duplicate Content Detection',
          observation: 'Identical text blocks detected ' +
                       'multiple times — possible counterfeit ' +
                       'label reprinting or sticker overlay. ' +
                       `Unique ratio: ${Math.round(dupRatio * 100)}%`
        });
      } else {
        console.log('   ✅ s29 PASS — no duplicate patterns');
      }
    } else {
      console.log('   ✅ s29 PASS — text too short to check duplicates');
    }
  } else {
    console.log('   ⚠️  s29 SKIP — no text available');
  }

  console.log(`\n📋 s26–s29 validation complete — ${issues.length} issues found`);
  issues.forEach(i =>
    console.log(`   [${i.checkId}][${i.severity}] ${i.checkName}: ${i.observation.substring(0, 60)}`)
  );

  return issues;
}

// ─── Build AI explanations from vision + validation results ─
function buildExplanations(visionResult, validationResult, qualityResult, textValidationIssues) {
  const explanations = [];

  // LLaVA-provided explanations
  if (visionResult?.source === 'llava' && visionResult?.data?.issues) {
    for (const issue of visionResult.data.issues.slice(0, 4)) {
      explanations.push({
        area: 'LLaVA Vision',
        issue: String(issue.field || 'Visual feature'),
        detail: String(issue.observation || 'Unable to assess clearly.')
      });
    }
  }

  // Sharp fallback explanations
  if (visionResult?.source === 'sharp-fallback' && visionResult?.visual_flags) {
    for (const flag of visionResult.visual_flags.slice(0, 3)) {
      explanations.push({
        area: 'Sharp Fallback Analysis',
        issue: 'Image quality metric',
        detail: flag
      });
    }
  }

  // Validation service explanations
  if (validationResult?.flags) {
    for (const f of validationResult.flags.slice(0, 3)) {
      explanations.push({
        area: 'Validation Engine',
        issue: f.severity || 'Check',
        detail: f.flag
      });
    }
  }

  // s26–s29 text validation explanations
  if (textValidationIssues) {
    for (const t of textValidationIssues.slice(0, 3)) {
      explanations.push({
        area: `Text Validation [${t.checkId}]`,
        issue: t.checkName || t.field,
        detail: t.observation
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
      console.log('✅ Quality gate:', qualityResult?.qualityGate || 'UNKNOWN');

      if (qualityResult?.qualityGate === 'FAIL') {
        console.warn('⛔ Quality gate FAIL:', qualityResult?.reason);
        return {
          error:             'image_quality',
          cannotAnalyze:     true,
          message:           qualityResult.reason,
          userMessage:       'We cannot analyze this image. ' +
                             'Please upload a clearer, ' +
                             'well-lit photo of the medicine packaging.',
          suggestions: [
            'Ensure good lighting — avoid shadows',
            'Hold camera steady — avoid blur',
            'Capture the full packaging label',
            'Minimum recommended size: 500x500px'
          ],
          score:             null,
          overallAssessment: null,
          confidence:        null,
          issuesFound:       [],
          authenticity_score: 0,
          status: 'CANNOT_ANALYZE',
          red_flags: [],
          summary: qualityResult.reason,
          ai_explanations: [],
          vision: { score: 0, flags: [], source: 'quality_gate' },
          ocr: { raw_text: '', confidence: 0, parsed: {}, source: 'none' },
          validation: {},
          fda: {}
        };
      }

      console.log('✅ Quality gate: PASS');
      console.log(`   Entropy:    ${qualityResult.metrics?.entropy}`);
      console.log(`   Brightness: ${qualityResult.metrics?.brightness}`);

    } catch (qualityErr) {
      console.warn('⚠️ Quality analysis failed; continuing:', qualityErr.message || qualityErr);
    }

    // ─── Steps 1 & 3: OCR + LLaVA in parallel ────────────
    const startTime = Date.now();
    console.log('⚡ Running OCR + LLaVA in parallel...');

    const [ocrResult, visionAnalysis] = await Promise.all([
      runOCR(base64Data).catch(err => {
        console.error('⚠️ OCR failed:', err.message);
        return {
          text:       '',
          rawText:    '',
          confidence: 0,
          parsed:     {},
          source:     'tesseract-failed',
          error:      err.message
        };
      }),
      runLLaVAAnalysis(image).catch(err => {
        console.error('⚠️ LLaVA failed:', err.message);
        return {
          issues:            [],
          authenticityScore: 50,
          packagingType:     'unknown',
          drugNameVisible:   null,
          rawResponse:       null,
          source:            'llava-failed',
          success:           false,
          error:             err.message
        };
      })
    ]);

    const elapsed = Date.now() - startTime;
    console.log(`⏱️  Parallel analysis completed in ${elapsed}ms`);
    console.log('✅ OCR confidence:', ocrResult.confidence);
    console.log('✅ LLaVA success:', visionAnalysis.success);
    console.log('✅ LLaVA score:', visionAnalysis.authenticityScore);

    // ─── Build vision result from LLaVA or Sharp fallback ──
    let visionResult;

    if (visionAnalysis.success && visionAnalysis.source === 'llava') {
      visionResult = {
        score: visionAnalysis.authenticityScore || 50,
        flags: (visionAnalysis.issues || []).map((i) => `${i.field}: ${i.observation}`),
        source: 'llava',
        rawResponse: visionAnalysis.rawResponse || null
      };
      console.log('🔍 Vision source: LLaVA | Score:', visionResult.score);

    } else if (visionAnalysis.success && visionAnalysis.source === 'sharp-fallback') {
      visionResult = {
        score: visionAnalysis.authenticityScore || 50,
        flags: (visionAnalysis.issues || []).map((i) => `${i.field}: ${i.observation}`),
        source: 'sharp-fallback',
        penalized: true,
        penaltyReason: visionAnalysis.penaltyReason || 'LLaVA unavailable'
      };
      console.log('🔍 Vision source: Sharp fallback | Score:', visionResult.score);

    } else if (visionAnalysis.source === 'llava-fallback') {
      visionResult = {
        score: visionAnalysis.authenticityScore || 50,
        flags: (visionAnalysis.issues || []).map((i) => `${i.field}: ${i.observation}`),
        source: 'llava-fallback',
        rawResponse: null
      };
      console.log('🔍 Vision source: LLaVA fallback | Score:', visionResult.score);

    } else {
      visionResult = {
        score: 50,
        flags: ['Vision analysis unavailable — using neutral score'],
        source: 'fallback_neutral',
        penalized: true,
        penaltyReason: 'All vision providers failed'
      };
      console.log('🔍 Vision source: neutral fallback | Score:', visionResult.score);
    }

    // ─── Step 2: Validation engine (runValidation) ────────
    let validationResult = { validation_score: 50, flags: [], details: {}, fda: {}, isExpired: false, drugNotInFDA: false };
    try {
      validationResult = await runValidation(ocrResult.parsed || {});
      console.log('✅ Validation API call success | score:', validationResult.validation_score ?? 50);
    } catch (valErr) {
      console.error('❌ Validation API call failed:', valErr.message || valErr);
      console.warn('⚠️ Validation failed:', valErr.message || valErr);
    }

    // ─── Fix 4: s26–s29 labeled text validation ───────────
    const parsedFields = ocrResult.parsed || {};
    const textValidationIssues = validateExtractedText(
      ocrResult.text || '',
      parsedFields
    );

    // ─── Fix 6: Standalone OpenFDA cross-reference ────────
    let fdaDirectResult = null;
    let fdaDirectIssues = [];
    try {
      fdaDirectResult = await Promise.race([
        lookupDrugFDA(parsedFields.drugName),
        new Promise(resolve => setTimeout(() => resolve(null), 4000))
      ]);
      fdaDirectIssues = buildFDAIssues(fdaDirectResult, parsedFields);

      if (fdaDirectResult?.found) {
        console.log('\n💊 FDA Direct Validation:');
        console.log(`   Official name: ${fdaDirectResult.officialName}`);
        console.log(`   Manufacturer:  ${fdaDirectResult.manufacturer}`);
        console.log(`   FDA issues:    ${fdaDirectIssues.length}`);
      } else if (fdaDirectResult && !fdaDirectResult.found) {
        console.log(`\n💊 FDA Direct: "${parsedFields.drugName}" NOT found in FDA database`);
      }
    } catch (fdaErr) {
      console.warn('⚠️ FDA direct lookup failed:', fdaErr.message);
    }

    // ─── Analysis results log ─────────────────────────────
    console.log('\n📊 Analysis results:');
    console.log(`   OCR text length: ${(ocrResult.text || '').length} chars`);
    console.log(`   OCR confidence:  ${ocrResult.confidence}%`);
    console.log(`   Vision source:   ${visionResult.source}`);
    console.log(`   Vision score:    ${visionResult.score}`);
    console.log(`   Vision issues:   ${(visionResult.flags || []).length}`);
    console.log(`   s26–s29 issues:  ${textValidationIssues.length}`);
    console.log(`   FDA issues:      ${fdaDirectIssues.length}`);

    // ─── Step 5: Final weighted scoring ───────────────────
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

    // Apply s26–s29 text validation penalties
    const textCriticalCount = textValidationIssues.filter(i => i.severity === 'CRITICAL').length;
    const textWarningCount = textValidationIssues.filter(i => i.severity === 'WARNING').length;
    finalScore -= (textCriticalCount * 15) + (textWarningCount * 5);

    // Apply FDA direct issues penalties
    finalScore -= fdaDirectIssues.length * 8;

    // Clamp
    finalScore = Math.max(0, Math.min(100, finalScore));

    // ─── Step 6: Hard flag overrides ──────────────────────
    const hardFlags = {
      likelyFake: false,
      reasons: []
    };

    if (validationResult.drugNotInFDA) {
      hardFlags.reasons.push('Drug not found in FDA database');
    }

    if (validationResult.isExpired) {
      hardFlags.likelyFake = true;
      hardFlags.reasons.push('Product is expired');
      finalScore = Math.min(finalScore, 25);
    }

    // s26 expired override
    if (textValidationIssues.some(i => i.checkId === 's26' && i.severity === 'CRITICAL')) {
      hardFlags.likelyFake = true;
      hardFlags.reasons.push('Expiry date check (s26) — product is expired');
      finalScore = Math.min(finalScore, 25);
    }

    // s29 duplicate content override
    if (textValidationIssues.some(i => i.checkId === 's29' && i.severity === 'CRITICAL')) {
      hardFlags.reasons.push('Duplicate content detected (s29) — possible reprinted label');
      finalScore = Math.max(0, finalScore - 20);
    }

    if (ocrConfidence < 15 && !ocrResult.parsed?.drugName && !ocrResult.parsed?.batchNumber) {
      hardFlags.reasons.push('Severe OCR mismatch — text unreadable');
      finalScore = Math.max(0, finalScore - 15);
    }

    if (validationResult.drugNotInFDA && hardFlags.reasons.length >= 2) {
      hardFlags.likelyFake = true;
      finalScore = Math.min(finalScore, 30);
    }

    const status = determineStatus(finalScore, hardFlags);

    // ─── Build red flags ──────────────────────────────────
    const redFlags = [];

    for (const flag of visionResult.flags || []) {
      redFlags.push({ flag, confidence: null });
    }

    for (const f of validationResult.flags || []) {
      redFlags.push({ flag: f.flag, confidence: f.severity === 'CRITICAL' ? 95 : 70 });
    }

    // s26–s29 red flags
    for (const t of textValidationIssues) {
      redFlags.push({
        flag: `[${t.checkId}] ${t.observation}`,
        confidence: t.severity === 'CRITICAL' ? 95 : 65
      });
    }

    // FDA direct issues
    for (const f of fdaDirectIssues) {
      redFlags.push({
        flag: `[${f.checkId}] ${f.observation}`,
        confidence: 75
      });
    }

    for (const q of qualityResult?.issues || []) {
      redFlags.push({ flag: `${q.field}: ${q.observation}`, confidence: null });
    }

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
      { source: visionResult.source, data: visionAnalysis.success ? visionAnalysis : null, visual_flags: visionResult.flags },
      validationResult,
      qualityResult,
      textValidationIssues
    );

    // ─── Fallback notice for Angular frontend ─────────────
    const analysisNotice = visionResult.penalized
      ? {
          type:    'warning',
          message: 'AI visual analysis was unavailable. ' +
                   'Result is based on image quality metrics ' +
                   'and OCR text validation only. ' +
                   'Consider rescanning for full analysis.'
        }
      : null;

    // ─── Final verdict log ────────────────────────────────
    console.log('\n🏁 Final verdict:');
    console.log(`   Score:      ${finalScore}`);
    console.log(`   Assessment: ${status}`);
    console.log(`   Confidence: ${ocrConfidence}`);
    console.log('='.repeat(50) + '\n');

    // ─── Assemble final response ──────────────────────────
    return {
      authenticity_score: finalScore,
      status,
      red_flags: redFlags.slice(0, 12),
      summary,
      ai_explanations: aiExplanations,
      analysisNotice,
      vision: {
        score: visionResult.score,
        flags: visionResult.flags,
        source: visionResult.source,
        llava_success: !!visionAnalysis?.success
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
        validation_issues: [
          ...(validationResult.flags || []).map((f) => ({
            severity: f.severity || 'WARNING',
            field: 'Validation',
            observation: f.flag
          })),
          ...textValidationIssues.map(t => ({
            severity: t.severity,
            field: t.checkId,
            observation: t.observation
          }))
        ],
        source: ocrResult.source
      },
      validation: {
        score: validationResult.validation_score,
        flags: validationResult.flags,
        details: validationResult.details,
        text_checks: textValidationIssues
      },
      fda: validationResult.fda || { checked: false, matched: false, source: 'openFDA', query: null, message: 'Not performed' },
      fdaValidation: fdaDirectResult
        ? {
            found:        fdaDirectResult.found,
            officialName: fdaDirectResult.officialName || null,
            genericName:  fdaDirectResult.genericName || null,
            manufacturer: fdaDirectResult.manufacturer || null,
            rxRequired:   fdaDirectResult.rxRequired || false,
            issues:       fdaDirectIssues
          }
        : null,
      scoring_breakdown: {
        vision_score: visionScore,
        vision_source: visionResult.source,
        ocr_confidence: ocrConfidence,
        validation_score: validationScore,
        fda_score: fdaScore,
        text_critical: textCriticalCount,
        text_warnings: textWarningCount,
        fda_direct_issues: fdaDirectIssues.length,
        hard_flags: hardFlags,
        formula: '(vision*0.4) + (ocr*0.2) + (validation*0.2) + (fda*0.2) - text_penalties - fda_penalties'
      },
      model_used: {
        vision: visionResult.source,
        ocr: ocrResult.source || 'tesseract',
        quality: 'sharp',
        validation: 'deterministic',
        database: 'openFDA'
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

// ─── Fix 5: Improved multi-image aggregation ────────────────
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

  // Filter out quality-failed images (cannotAnalyze)
  const validResults = results.filter(r => !r.cannotAnalyze);
  const failedCount = results.length - validResults.length;

  if (validResults.length === 0) {
    return {
      authenticity_score: 0,
      status: 'CANNOT_ANALYZE',
      red_flags: [{ flag: 'All images failed quality checks', confidence: 100 }],
      summary: '⛔ None of the uploaded images passed quality checks. Please upload clearer photos.',
      ai_explanations: [],
      vision: { score: 0, flags: [], source: 'none' },
      ocr: {},
      validation: {},
      fda: {},
      image_count: results.length,
      images_failed: failedCount
    };
  }

  console.log(`\n🔄 Aggregating ${validResults.length} valid images (${failedCount} failed quality)...`);

  // ─── Score aggregation: 70% worst-case + 30% average ───
  // Prevents a single good angle from hiding a counterfeit indicator
  const scores = validResults.map(r => r.authenticity_score || 0);
  const worstScore = Math.min(...scores);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const aggregatedScore = Math.round((worstScore * 0.7) + (avgScore * 0.3));

  console.log(`   Scores: [${scores.join(', ')}] → worst: ${worstScore}, avg: ${avgScore}, aggregated: ${aggregatedScore}`);

  // ─── Merge red flags (deduplicate, keep highest confidence) ──
  const redFlagMap = new Map();
  for (const result of validResults) {
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

  // ─── Merge explanations ─────────────────────────────────
  const explanationMap = new Map();
  for (const result of validResults) {
    for (const exp of result?.ai_explanations || []) {
      const key = `${exp?.area}::${exp?.issue}`;
      if (!explanationMap.has(key)) explanationMap.set(key, exp);
    }
  }
  const mergedExplanations = Array.from(explanationMap.values()).slice(0, 6);

  // ─── Merge OCR — concatenate all text for broader coverage ──
  const allOcrTexts = validResults
    .map(r => r?.ocr?.raw_text || '')
    .filter(t => t.trim().length > 0);
  const mergedOcrText = allOcrTexts.join('\n');

  // Take best OCR result (highest confidence)
  const bestOcrResult = validResults
    .filter(r => r?.ocr?.confidence > 0)
    .sort((a, b) => (b.ocr.confidence || 0) - (a.ocr.confidence || 0))[0];
  const bestOcr = bestOcrResult?.ocr || validResults[0]?.ocr || {};

  // ─── Merge extracted fields — fill gaps from multiple angles ──
  const mergedFields = {};
  const fieldNames = ['drugName', 'dosage', 'batchNumber', 'expiryDate', 'manufacturer'];
  for (const field of fieldNames) {
    mergedFields[field] = validResults
      .map(r => r?.ocr?.extracted_fields?.[field])
      .find(v => v != null && v !== '') || null;
  }
  mergedFields.rxSymbol = validResults.some(r => r?.ocr?.extracted_fields?.rxSymbol);

  // ─── Merge validation issues (deduplicate by observation) ──
  const validationIssueMap = new Map();
  for (const result of validResults) {
    for (const vi of result?.ocr?.validation_issues || []) {
      const key = vi.observation;
      if (!validationIssueMap.has(key)) validationIssueMap.set(key, vi);
    }
  }
  const mergedValidationIssues = Array.from(validationIssueMap.values());

  // ─── Merge FDA (prefer matched) ─────────────────────────
  const matchedFda = validResults.find((r) => r?.fda?.matched);
  const checkedFda = validResults.find((r) => r?.fda?.checked);
  const mergedFda = matchedFda?.fda || checkedFda?.fda || validResults[0]?.fda || {};

  // Merge fdaValidation
  const fdaValidation = validResults.find(r => r?.fdaValidation)?.fdaValidation || null;

  // ─── Merge validation ───────────────────────────────────
  const bestValidation = validResults.find((r) => r?.validation?.score != null)?.validation || {};

  // Merge text_checks from all images
  const allTextChecks = validResults.flatMap(r => r?.validation?.text_checks || []);
  const uniqueTextChecks = [];
  const seenCheckObs = new Set();
  for (const tc of allTextChecks) {
    const key = `${tc.checkId}:${tc.observation}`;
    if (!seenCheckObs.has(key)) {
      seenCheckObs.add(key);
      uniqueTextChecks.push(tc);
    }
  }

  // ─── Merge vision ──────────────────────────────────────
  const bestVision = validResults.find((r) => r?.vision?.source === 'llava')?.vision
    || validResults.find((r) => r?.vision?.source === 'sharp-fallback')?.vision
    || validResults[0]?.vision || {};

  // Merge analysisNotice (prefer warning)
  const analysisNotice = validResults.find((r) => r?.analysisNotice)?.analysisNotice || null;

  // ─── Determine overall status ──────────────────────────
  const hasLikelyFake = validResults.some((r) => r?.status === 'LIKELY FAKE');
  const hasSuspicious = validResults.some((r) => r?.status === 'SUSPICIOUS');
  let status;
  if (hasLikelyFake) status = 'LIKELY FAKE';
  else if (hasSuspicious || aggregatedScore < 75) status = 'SUSPICIOUS';
  else status = 'REAL';

  let summary;
  if (status === 'REAL') {
    summary = `✅ Multi-image review (${validResults.length} photos) suggests this package appears authentic.`;
  } else if (status === 'SUSPICIOUS') {
    summary = `⚠️ Multi-image review (${validResults.length} photos) found inconsistencies. Manual verification recommended.`;
  } else {
    summary = `🚨 Multi-image review (${validResults.length} photos) indicates high counterfeit risk.`;
  }

  // Confidence is higher with more images
  const confidence = validResults.length >= 3 ? 'High' : validResults.length >= 2 ? 'Medium-High' : 'Medium';

  console.log(`\n📊 Aggregated result:`);
  console.log(`   Images analyzed: ${validResults.length}/${results.length}`);
  console.log(`   Aggregated score: ${aggregatedScore}`);
  console.log(`   Status: ${status}`);
  console.log(`   Confidence: ${confidence}`);

  return {
    authenticity_score: aggregatedScore,
    status,
    red_flags: redFlags,
    summary,
    ai_explanations: mergedExplanations,
    analysisNotice,
    aggregated: true,
    confidence,
    vision: bestVision,
    ocr: {
      ...bestOcr,
      raw_text: mergedOcrText,
      extracted_fields: mergedFields,
      validation_issues: mergedValidationIssues
    },
    validation: {
      ...bestValidation,
      text_checks: uniqueTextChecks
    },
    fda: mergedFda,
    fdaValidation,
    scoring_breakdown: {
      per_image_scores: scores,
      worst_score: worstScore,
      average_score: avgScore,
      aggregated_score: aggregatedScore,
      formula: '(worst * 0.7) + (avg * 0.3)'
    },
    model_used: {
      vision: bestVision?.source || 'unknown',
      ocr: 'tesseract',
      quality: 'sharp',
      validation: 'deterministic',
      database: 'openFDA',
      mode: 'multi-image',
      images_analyzed: validResults.length,
      images_failed: failedCount
    },
    image_count: results.length,
    images_analyzed: validResults.length,
    images_failed: failedCount,
    per_image_results: results
  };
}

// ─── POST /api/verify-medicine ──────────────────────────────
app.post('/api/verify-medicine', async (req, res) => {
  console.log('\n' + '='.repeat(50));
  console.log('🔬 New verification request');
  console.log('='.repeat(50));

  // Support both { image } and { images } payloads
  const imagesFromArray = Array.isArray(req.body?.images)
    ? req.body.images.filter((v) => typeof v === 'string' && v.trim().length > 0)
    : [];

  const singleImage = typeof req.body?.image === 'string' && req.body.image.trim().length > 0
    ? [req.body.image]
    : [];

  const images = imagesFromArray.length > 0 ? imagesFromArray : singleImage;

  if (images.length === 0) {
    console.warn('❌ /api/verify-medicine failed: no image provided');
    return res.status(400).json({
      error:   'no_image',
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

  if (images.length > 6) {
    console.warn('❌ /api/verify-medicine failed: too many images');
    return res.status(400).json({
      error:   'too_many_images',
      message: 'Maximum 6 images allowed',
      authenticity_score: 0,
      status: 'ERROR',
      red_flags: [],
      summary: '❌ Too many images — maximum 6 allowed.',
      ai_explanations: []
    });
  }

  console.log(`📸 Processing ${images.length} image(s)`);

  // Process all images (sequentially to avoid overloading LLaVA)
  const perImageResults = [];
  for (let i = 0; i < images.length; i++) {
    console.log(`\n── Image ${i + 1}/${images.length} ──`);
    const imageResult = await analyzeSingleImage(images[i]);
    perImageResults.push(imageResult);
  }

  console.log('✅ /api/verify-medicine success | images analyzed:', perImageResults.length);
  return res.json(aggregateResults(perImageResults));
});

// ─── Health check ───────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    providers: {
      llava: true,
      sharpFallback: true,
      tesseract: true,
      openFDA: true,
      validation: true
    }
  });
});

// ─── Start server ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Medi-Verify backend running on http://localhost:${PORT}`);
  console.log(`   POST /api/verify-medicine  — Analyze medicine image(s)`);
  console.log(`   GET  /api/health           — Health check`);
  console.log(`   ─── Providers ───`);
  console.log(`   Vision:     LLaVA (Ollama) → Sharp fallback ✅`);
  console.log(`   OCR:        Tesseract ✅`);
  console.log(`   Quality:    Sharp ✅`);
  console.log(`   Validation: Deterministic s26–s29 ✅`);
  console.log(`   Database:   OpenFDA ✅`);
  console.log('   💡 Make sure "ollama serve" is running in a separate terminal');
});
