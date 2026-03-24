const { Ollama } = require("ollama");
const sharp  = require("sharp");
const { runSharpFallback } = require("./sharp-fallback.service");

const ollama = new Ollama({
  host: "http://127.0.0.1:11434"  // explicit host — more reliable
});

const LLAVA_CONFIG = {
  model:       "llava:7b",
  temperature: 0.1,
  maxRetries:  2,
};

const MEDIFY_PROMPT = `You are a pharmaceutical 
packaging authenticity analyst.

Analyze this medicine packaging image carefully.
Check each area and report ONLY what you observe.

AREA 1 - HOLOGRAM/SECURITY SEAL:
Is a holographic or shiny security seal visible?
Does it look clear, iridescent, and undamaged?

AREA 2 - BRAND LOGO:
Is the manufacturer logo sharp and properly printed?
Is alignment correct or does it look skewed?

AREA 3 - PRINT QUALITY:
Does text appear clearly printed and sharp?
Are colors uniform or faded/inconsistent?
Any print artifacts, streaks, or smudging?

AREA 4 - PHYSICAL INTEGRITY:
Any tampering signs — torn edges, resealing marks,
damaged strips, or adhesive marks?

AREA 5 - SUSPICIOUS PATTERNS:
Is any text repeated identically more than once?
Is any text upside down, mirrored, or misaligned?
Any unexpected language or foreign script visible?

Return ONLY this raw JSON — no markdown, 
no backticks, no explanation:

{
  "hologram": {
    "status": "PASS" or "ISSUE" or "UNCLEAR",
    "detail": "one sentence of what you see"
  },
  "logo": {
    "status": "PASS" or "ISSUE" or "UNCLEAR",
    "detail": "one sentence of what you see"
  },
  "printQuality": {
    "status": "PASS" or "ISSUE" or "UNCLEAR",
    "detail": "one sentence of what you see"
  },
  "physicalIntegrity": {
    "status": "PASS" or "ISSUE" or "UNCLEAR",
    "detail": "one sentence of what you see"
  },
  "suspiciousPatterns": {
    "status": "PASS" or "ISSUE" or "UNCLEAR",
    "detail": "one sentence of what you see"
  },
  "authenticityScore": <0-100>,
  "packagingType": "medicine_box" or "blister_strip" 
                   or "needle_device" or "vial" or "other",
  "drugNameVisible": "drug name string or null",
  "overallObservation": "one sentence summary"
}`;

async function preprocessImage(imageBase64) {
  try {
    const cleanBase64 = imageBase64
      .replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

    if (!cleanBase64 || cleanBase64.length < 100) {
      throw new Error("Invalid base64 input");
    }

    const buffer = Buffer.from(cleanBase64, "base64");

    const processedBuffer = await sharp(buffer)
      .resize(672, 672, {
        fit:                "inside",
        withoutEnlargement: false
      })
      .normalise()
      .jpeg({ quality: 85 })
      .toBuffer();

    const meta = await sharp(processedBuffer).metadata();
    console.log(`📐 LLaVA input: ${meta.width}x${meta.height}px`);

    return processedBuffer.toString("base64");

  } catch (err) {
    console.error("❌ Image preprocessing failed:", err.message);
    return imageBase64
      .replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
  }
}

function parseLLaVAResponse(rawText) {
  try {
    let cleaned = rawText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/gi, "")
      .replace(/^\s*here.*?:\s*/i, "")
      .trim();

    const jsonStart = cleaned.indexOf("{");
    const jsonEnd   = cleaned.lastIndexOf("}");

    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("No JSON found in LLaVA response");
    }

    cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    return JSON.parse(cleaned);

  } catch (err) {
    console.error("❌ LLaVA JSON parse failed:", err.message);
    console.error("Raw was:", rawText.substring(0, 300));
    return null;
  }
}

function buildIssueList(parsed) {
  if (!parsed) return [];

  const severityMap = {
    hologram:           "CRITICAL",
    physicalIntegrity:  "CRITICAL",
    suspiciousPatterns: "CRITICAL",
    logo:               "WARNING",
    printQuality:       "WARNING",
  };

  return Object.entries(parsed)
    .filter(([key]) => ![
      "authenticityScore",
      "packagingType",
      "drugNameVisible",
      "overallObservation"
    ].includes(key))
    .filter(([, val]) => val?.status === "ISSUE")
    .map(([key, val]) => ({
      severity:    severityMap[key] || "WARNING",
      field:       key,
      observation: val.detail,
      source:      "llava"
    }));
}

async function runLLaVAFallback(imageBase64) {
  console.log("🦙 Trying LLaVA simple fallback prompt...");

  const SIMPLE_PROMPT = `Look at this medicine packaging.
Answer each with yes, no, or unclear:

1. Is a holographic security seal visible?
2. Does the logo look sharp and properly printed?
3. Are there any signs of tampering or damage?
4. Is any text upside down or mirrored?
5. Does packaging look professionally manufactured?
6. Authenticity score 0-100?

Answer format:
1: yes/no/unclear
2: yes/no/unclear
3: yes/no/unclear
4: yes/no/unclear
5: yes/no/unclear
Score: <number>`;

  try {
    const processedBase64 = await preprocessImage(imageBase64);
    const response = await ollama.chat({
      model:    LLAVA_CONFIG.model,
      messages: [{
        role:    "user",
        content: SIMPLE_PROMPT,
        images:  [processedBase64]
      }],
      options: { temperature: 0.1, num_predict: 150 }
    });

    const text   = response.message?.content || "";
    const lines  = text.toLowerCase().split('\n');
    const issues = [];

    if (lines[0]?.includes("no")) {
      issues.push({
        severity:    "CRITICAL",
        field:       "hologram",
        observation: "No holographic security seal visible",
        source:      "llava-fallback"
      });
    }
    if (lines[2]?.includes("yes")) {
      issues.push({
        severity:    "CRITICAL",
        field:       "physicalIntegrity",
        observation: "Signs of tampering detected",
        source:      "llava-fallback"
      });
    }
    if (lines[3]?.includes("yes")) {
      issues.push({
        severity:    "CRITICAL",
        field:       "suspiciousPatterns",
        observation: "Upside down or mirrored text detected",
        source:      "llava-fallback"
      });
    }

    const scoreMatch = text.match(/score:\s*(\d+)/i);
    return {
      issues,
      authenticityScore: scoreMatch ? parseInt(scoreMatch[1]) : 50,
      source:            "llava-fallback",
      success:           true
    };

  } catch (err) {
    return {
      issues:            [],
      authenticityScore: 50,
      source:            "llava-fallback-failed",
      success:           false,
      error:             err.message
    };
  }
}

async function runLLaVAAnalysis(imageBase64, retryCount = 0) {
  console.log(`🦙 LLaVA analysis — attempt ${retryCount + 1}`);

  try {
    const processedBase64 = await preprocessImage(imageBase64);

    const response = await ollama.chat({
      model:    LLAVA_CONFIG.model,
      messages: [{
        role:    "user",
        content: MEDIFY_PROMPT,
        images:  [processedBase64]
      }],
      options: {
        temperature: LLAVA_CONFIG.temperature,
        num_predict: 600,
      }
    });

    const rawText = response.message?.content || "";
    console.log("🦙 Raw:", rawText.substring(0, 200));

    const parsed = parseLLaVAResponse(rawText);

    // If JSON parsing failed, try simpler fallback
    if (!parsed && retryCount < LLAVA_CONFIG.maxRetries) {
      return runLLaVAFallback(imageBase64);
    }

    const issues = buildIssueList(parsed);
    console.log(`✅ LLaVA complete — ${issues.length} issues found`);

    return {
      issues,
      authenticityScore:  parsed?.authenticityScore  ?? 50,
      packagingType:      parsed?.packagingType      ?? "unknown",
      drugNameVisible:    parsed?.drugNameVisible    ?? null,
      overallObservation: parsed?.overallObservation ?? null,
      rawResponse:        parsed,
      source:             "llava",
      success:            true
    };

  } catch (err) {
    console.error("❌ LLaVA error:", err.message);

    if (err.message.includes("ECONNREFUSED")) {
      console.error("💡 Fix: run 'ollama serve' in a terminal");
    }

    // LLaVA failed — switch to Sharp deterministic fallback
    console.log("⚠️  LLaVA failed — switching to Sharp fallback");
    return runSharpFallback(imageBase64);
  }
}

module.exports = { runLLaVAAnalysis };
