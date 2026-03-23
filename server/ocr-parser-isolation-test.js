function extractBatch(text) {
  const match = text.match(/\b(LOT|Lot|lot|BATCH|Batch)[:\s#]?\s*([A-Z0-9\-]{4,14})\b/);
  return match ? match[2] : null;
}

function extractExpiry(text) {
  const match = text.match(/\b(EXP|Exp|exp|EXPIRY|USE BY)?\.?\s*(\d{2})[\/-](\d{2,4})\b/)
    || text.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})\b/i);
  return match ? match[0] : null;
}

function extractDosage(text) {
  const match = text.match(/\b(\d+\.?\d*)\s*(mg|mcg|ml|g|IU|UNITS|units|µg)\b/i);
  return match ? match[0] : null;
}

function extractDrugName(text) {
  const firstLine = text.split('\n')[0]?.trim() || '';
  return firstLine.length > 2 ? firstLine : null;
}

function extractManufacturer(text) {
  const match = text.match(/\b(Mfg|Mfd|Manufactured by|MANUFACTURED BY)[.:\s]+([^\n]+)/i);
  return match ? match[2].trim() : null;
}

function parseOCRFields(rawText) {
  return {
    drugName: extractDrugName(rawText),
    dosage: extractDosage(rawText),
    batchNumber: extractBatch(rawText),
    expiryDate: extractExpiry(rawText),
    manufacturer: extractManufacturer(rawText),
    rxSymbol: rawText.includes('Rx') || rawText.includes('℞'),
  };
}

const samples = [
  {
    name: 'Clear known medicine',
    text: `Paracetamol 500mg\nLOT: A12B45\nEXP 12/2026\nManufactured by Acme Pharma\nRx`
  },
  {
    name: 'With batch + month expiry format',
    text: `Ibuprofen Tablets\nBatch# ZX99K2\nJAN 2027\nMfg. HealthCorp Labs`
  },
  {
    name: 'Expired medicine style',
    text: `Aspirin 150 mg\nLOT: OLD2020\nExp: 02-2021\nMfd Reliable Labs`
  },
  {
    name: 'Missing batch',
    text: `Metformin 500mg\nEXP 09/2028\nManufactured by Metro Meds`
  },
  {
    name: 'Wrong dosage format',
    text: `Amoxicillin five hundred\nLOT: AMX-22B\nEXP 11/2027\nMfg Generic Pharma`
  },
  {
    name: 'Symbol only with units',
    text: `Botulinum Injection\n150 UNITS\nLot BOTOX88\nUse by 10/2029\n℞`
  },
  {
    name: 'Blurry OCR-like text',
    text: `P4racetam0l 5OOmg\nL0T ?\nE?? 1?/20?6\nManuf by ???`
  },
  {
    name: 'Non-medicine stress text',
    text: `Welcome to Coffee House\nOrder #2231\nBest before 12/2026`
  }
];

const results = samples.map((s) => ({
  sample: s.name,
  parsed: parseOCRFields(s.text)
}));

console.log(JSON.stringify(results, null, 2));
