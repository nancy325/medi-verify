// services/openfda.service.js
// Standalone OpenFDA drug lookup with in-memory caching.
// Used for cross-referencing OCR-extracted drug names against FDA database.

const axios = require('axios');

const FDA_LABEL_API = 'https://api.fda.gov/drug/label.json';

// In-memory cache — avoids repeat FDA calls for the same drug during a demo session
const fdaCache = new Map();

/**
 * Look up a drug name in the OpenFDA database.
 * Tries brand name first, then generic name.
 * Returns cached result if available.
 *
 * @param {string} drugName — drug name extracted from OCR
 * @returns {Promise<object|null>}
 */
async function lookupDrugFDA(drugName) {
  if (!drugName || drugName.trim().length < 3) return null;

  const cacheKey = drugName.toLowerCase().trim();
  if (fdaCache.has(cacheKey)) {
    console.log(`💊 FDA cache hit: "${drugName}"`);
    return fdaCache.get(cacheKey);
  }

  console.log(`💊 Looking up FDA database: "${drugName}"`);

  try {
    // Try brand name first
    const brandResponse = await axios.get(FDA_LABEL_API, {
      params: {
        search: `openfda.brand_name:"${drugName}"`,
        limit: 1
      },
      timeout: 5000  // don't let FDA slow down demo
    });

    const result = brandResponse.data?.results?.[0];
    if (result?.openfda) {
      const fdaData = buildFDAData(drugName, result);
      fdaCache.set(cacheKey, fdaData);
      return fdaData;
    }

    // Brand not found — try generic name
    const genericResponse = await axios.get(FDA_LABEL_API, {
      params: {
        search: `openfda.generic_name:"${drugName}"`,
        limit: 1
      },
      timeout: 5000
    });

    const genericResult = genericResponse.data?.results?.[0];
    if (genericResult?.openfda) {
      const fdaData = buildFDAData(drugName, genericResult);
      fdaCache.set(cacheKey, fdaData);
      return fdaData;
    }

    // Not found at all
    const notFound = {
      found: false,
      drugName,
      officialName: null,
      genericName: null,
      manufacturer: null,
      dosageForms: [],
      rxRequired: false,
      source: 'openFDA'
    };
    fdaCache.set(cacheKey, notFound);
    return notFound;

  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      console.warn('⚠️  FDA lookup timed out — skipping');
    } else if (err.response?.status === 404) {
      const notFound = {
        found: false,
        drugName,
        officialName: null,
        genericName: null,
        manufacturer: null,
        dosageForms: [],
        rxRequired: false,
        source: 'openFDA'
      };
      fdaCache.set(cacheKey, notFound);
      return notFound;
    } else {
      console.error('⚠️  FDA lookup failed:', err.message);
    }
    return null;
  }
}

/**
 * Build structured FDA data from an openFDA result
 */
function buildFDAData(drugName, result) {
  const openfda = result.openfda || {};
  const fdaData = {
    found:        true,
    drugName,
    officialName: openfda.brand_name?.[0]        || null,
    genericName:  openfda.generic_name?.[0]       || null,
    manufacturer: openfda.manufacturer_name?.[0]  || null,
    dosageForms:  openfda.dosage_form             || [],
    rxRequired:   (openfda.product_type?.[0] || '').includes('PRESCRIPTION'),
    source:       'openFDA'
  };
  console.log(`   ✅ FDA found: ${fdaData.officialName} by ${fdaData.manufacturer}`);
  return fdaData;
}

/**
 * Build validation issues by comparing FDA data against packaging OCR fields
 */
function buildFDAIssues(fdaResult, parsedFields) {
  if (!fdaResult) return [];

  const issues = [];

  // Drug not in FDA database at all
  if (!fdaResult.found) {
    issues.push({
      severity:    'WARNING',
      field:       'drugName',
      checkId:     'fda-01',
      checkName:   'FDA Database Lookup',
      observation: `"${fdaResult.drugName}" not found in ` +
                   'FDA drug database — verify this is ' +
                   'an approved medicine',
      source:      'openFDA'
    });
    return issues;
  }

  // Manufacturer mismatch
  if (
    parsedFields?.manufacturer &&
    fdaResult.manufacturer &&
    !parsedFields.manufacturer
      .toLowerCase()
      .includes(
        fdaResult.manufacturer.toLowerCase().split(' ')[0]
      )
  ) {
    issues.push({
      severity:    'WARNING',
      field:       'manufacturer',
      checkId:     'fda-02',
      checkName:   'FDA Manufacturer Cross-Check',
      observation: `Manufacturer mismatch — packaging shows ` +
                   `"${parsedFields.manufacturer}" but FDA ` +
                   `records show "${fdaResult.manufacturer}"`,
      source:      'openFDA'
    });
  }

  return issues;
}

module.exports = { lookupDrugFDA, buildFDAIssues };
