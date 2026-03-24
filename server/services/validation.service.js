// services/validation.service.js
// Deterministic validation engine — expiry, batch, drug name, openFDA.
// Fully independent; can run without any AI/vision service.

const axios = require('axios');
const path = require('path');
const knownDrugs = require(path.join(__dirname, '..', 'data', 'known-drugs.json'));

const OPEN_FDA_DRUG_LABEL_API = 'https://api.fda.gov/drug/label.json';

// ─── Expiry date extraction ────────────────────────────────
function extractExpiry(text) {
  const match =
    text.match(/\b(EXP|Exp|exp|EXPIRY|USE BY)?\.?\s*(\d{2})[\/\-](\d{2,4})\b/) ||
    text.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})\b/i);
  return match ? match[0].trim() : null;
}

// ─── 1. Expiry check ──────────────────────────────────────
function checkExpiry(parsedFields) {
  const expiryRaw = parsedFields?.expiryDate;
  if (!expiryRaw) {
    return { passed: false, flag: 'Expiry date not found on packaging', severity: 'WARNING' };
  }

  const match = String(expiryRaw).match(/(\d{2})[\/\-](\d{2,4})/);
  if (!match) {
    return { passed: false, flag: 'Expiry date format unrecognizable', severity: 'WARNING' };
  }

  let [, month, year] = match;
  if (year.length === 2) year = '20' + year;

  const expDate = new Date(parseInt(year), parseInt(month) - 1, 1);
  if (!Number.isNaN(expDate.getTime()) && expDate < new Date()) {
    return {
      passed: false,
      flag: `Medicine is EXPIRED — expiry was ${month}/${year}`,
      severity: 'CRITICAL',
      expired: true
    };
  }

  return { passed: true, flag: null };
}

// ─── 2. Batch format validation ───────────────────────────
function checkBatchFormat(parsedFields) {
  const batch = parsedFields?.batchNumber;
  if (!batch) {
    return { passed: false, flag: 'Batch number not found', severity: 'WARNING' };
  }

  // Standard batch: 4–14 alphanumeric chars, may include hyphens
  const valid = /^[A-Z0-9\-]{4,14}$/i.test(batch);
  if (!valid) {
    return { passed: false, flag: `Batch number "${batch}" has irregular format`, severity: 'WARNING' };
  }

  return { passed: true, flag: null };
}

// ─── 3. Drug name validation (local dataset) ─────────────
function checkDrugNameLocal(parsedFields) {
  const drugName = parsedFields?.drugName;
  if (!drugName || drugName.trim().length < 3) {
    return { passed: false, flag: 'Drug name not readable from packaging', severity: 'WARNING', matched: false };
  }

  const normalized = drugName.trim().toLowerCase();
  const found = knownDrugs.drugs.some(
    (d) => normalized.includes(d.toLowerCase()) || d.toLowerCase().includes(normalized)
  );

  if (!found) {
    return {
      passed: false,
      flag: `Drug name "${drugName}" not found in known medicines database`,
      severity: 'WARNING',
      matched: false
    };
  }

  return { passed: true, flag: null, matched: true };
}

// ─── 4. openFDA cross-reference ───────────────────────────
async function checkFDA(parsedFields) {
  const drugName = parsedFields?.drugName;
  if (!drugName || drugName.trim().length < 3) {
    return {
      checked: false,
      matched: false,
      source: 'openFDA',
      query: drugName || null,
      message: 'Drug name unavailable for FDA lookup',
      score: 50 // neutral — cannot verify
    };
  }

  const normalized = drugName.trim();
  const query = `openfda.generic_name:"${normalized}"+openfda.brand_name:"${normalized}"`;

  try {
    const response = await axios.get(OPEN_FDA_DRUG_LABEL_API, {
      params: { search: query, limit: 1 },
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
        message: 'No FDA label metadata found for extracted drug name',
        score: 20 // not found → high risk
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
      message: 'Drug name matched against openFDA labels',
      score: 100 // found → high confidence
    };
  } catch (error) {
    if (error?.response?.status === 404) {
      return {
        checked: true,
        matched: false,
        source: 'openFDA',
        query: normalized,
        message: 'Drug name not found in openFDA label set',
        score: 20
      };
    }

    return {
      checked: true,
      matched: false,
      source: 'openFDA',
      query: normalized,
      message: 'FDA lookup unavailable at the moment',
      error: error.message || String(error),
      score: 50 // unavailable → neutral
    };
  }
}

// ─── Master validation runner ─────────────────────────────
async function runValidation(parsedFields) {
  const flags = [];
  let score = 100;
  let isExpired = false;

  // Expiry check
  const expiryResult = checkExpiry(parsedFields);
  if (!expiryResult.passed) {
    flags.push({ flag: expiryResult.flag, severity: expiryResult.severity });
    score -= expiryResult.severity === 'CRITICAL' ? 40 : 15;
    if (expiryResult.expired) isExpired = true;
  }

  // Batch format
  const batchResult = checkBatchFormat(parsedFields);
  if (!batchResult.passed) {
    flags.push({ flag: batchResult.flag, severity: batchResult.severity });
    score -= 10;
  }

  // Drug name (local)
  const drugResult = checkDrugNameLocal(parsedFields);
  if (!drugResult.passed) {
    flags.push({ flag: drugResult.flag, severity: drugResult.severity });
    score -= 15;
  }

  // FDA
  const fdaResult = await checkFDA(parsedFields);
  if (fdaResult.checked && !fdaResult.matched) {
    flags.push({ flag: fdaResult.message, severity: 'WARNING' });
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  return {
    validation_score: score,
    flags,
    details: {
      expiry: expiryResult,
      batch: batchResult,
      drugName: drugResult
    },
    fda: fdaResult,
    isExpired,
    drugNotInFDA: fdaResult.checked && !fdaResult.matched
  };
}

module.exports = { runValidation, checkExpiry, checkBatchFormat, checkDrugNameLocal, checkFDA };
