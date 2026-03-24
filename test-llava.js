try {
  require("dotenv").config({ path: "./server/.env" });
} catch (e) {
  // dotenv optional
}
const { runLLaVAAnalysis } = require("./server/services/llava.service");
const fs = require("fs");
const path = require("path");

async function test() {
  console.log("🦙 Testing LLaVA integration with Ollama...\n");

  // Try to load test images from test-images directory
  const testImagesDir = path.join(__dirname, "test-images");
  const testImages = [];

  if (fs.existsSync(testImagesDir)) {
    const files = fs.readdirSync(testImagesDir).filter(f => /\.(png|jpg|jpeg)$/i.test(f));
    testImages.push(...files);
    console.log(`📁 Found ${testImages.length} test images in test-images/\n`);
  } else {
    console.log(`⚠️  test-images/ directory not found`);
    console.log(`   To test with real images, place .png or .jpg files in: ${testImagesDir}\n`);
  }

  if (testImages.length === 0) {
    console.log("💡 Quick connectivity test instead:\n");
    
    // Create a minimal test image (1x1 red pixel PNG)
    const minimalPng = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
      0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0x99, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
      0x00, 0x00, 0x03, 0x00, 0x01, 0x5A, 0xAE, 0xBE, 0x8B, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);

    const base64 = minimalPng.toString("base64");
    const imageBase64 = `data:image/png;base64,${base64}`;

    console.log("📸 Testing with minimal 1x1 red pixel image\n");

    try {
      const result = await runLLaVAAnalysis(imageBase64);

      console.log("✅ LLaVA Response received:\n");
      console.log(`   Status:           ${result.success ? 'SUCCESS' : 'FAILED'}`);
      console.log(`   Authenticity:     ${result.authenticityScore}`);
      console.log(`   Packaging Type:   ${result.packagingType}`);
      console.log(`   Issues Found:     ${result.issues.length}`);
      console.log(`   Source:           ${result.source}\n`);

      if (result.issues.length > 0) {
        console.log("   Issues:");
        result.issues.forEach(issue => {
          console.log(`     [${issue.severity}] ${issue.field}: ${issue.observation}`);
        });
      }

      console.log("\n🎉 LLaVA is working! Ready for production use.\n");
      process.exit(0);

    } catch (err) {
      console.error("❌ Error:", err.message);
      console.error("\n💡 Troubleshooting:");
      console.error("   - Is 'ollama serve' running on port 11435?");
      console.error("   - Do you have llava:7b model? Run: ollama pull llava");
      console.error("   - Check OLLAMA_HOST environment variable\n");
      process.exit(1);
    }
    return;
  }

  // Process real test images
  for (const imageName of testImages) {
    const imagePath = path.join(testImagesDir, imageName);
    
    const imageBuffer = fs.readFileSync(imagePath);
    const base64      = imageBuffer.toString("base64");
    const ext         = path.extname(imageName).slice(1);
    const imageBase64 = `data:image/${ext};base64,${base64}`;

    console.log(`📸 Testing: ${imageName}`);
    console.log("─".repeat(50));

    try {
      const result = await runLLaVAAnalysis(imageBase64);

      console.log(`✅ Authenticity Score: ${result.authenticityScore}`);
      console.log(`   Packaging Type:    ${result.packagingType}`);
      console.log(`   Drug Found:        ${result.drugNameVisible || "N/A"}`);
      console.log(`   Issues:            ${result.issues.length}`);
      console.log(`   Summary:           ${result.overallObservation || "N/A"}\n`);
      
      if (result.issues.length > 0) {
        result.issues.forEach(issue => {
          console.log(`   [${issue.severity}] ${issue.field}: ${issue.observation}`);
        });
        console.log();
      }
    } catch (err) {
      console.error(`❌ Analysis failed: ${err.message}\n`);
    }
  }

  console.log("✅ Test complete!");
}

test().catch(console.error);

