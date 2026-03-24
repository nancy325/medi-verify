# Medi-Verify Tech Stack and Project Architecture

## 1) Project at a glance

Medi-Verify is a full-stack medicine authenticity verification prototype with:

- Angular 17 frontend (standalone components + HttpClient + RxJS)
- Node.js/Express backend API
- AI and deterministic verification pipeline (Gemini Vision + Tesseract OCR + Sharp metrics + openFDA cross-check)
- Tailwind-enabled styling pipeline, with most UI styling implemented in custom CSS and component-level styles

The application receives medicine package photos from the browser, analyzes them on the backend, and returns a confidence-like authenticity score, red flags, OCR evidence, and explainable AI reasoning.

## 2) Full repository structure (with purpose)

```text
medi-verify/
├─ angular.json
├─ package.json
├─ package-lock.json
├─ postcss.config.js
├─ tailwind.config.js
├─ tsconfig.json
├─ tsconfig.app.json
├─ tsconfig.spec.json
├─ README.md
├─ TECH_STACK.md
├─ src/
│  ├─ index.html
│  ├─ main.ts
│  ├─ styles.css
│  ├─ environments/
│  │  ├─ environment.ts
│  │  └─ environment.development.ts
│  └─ app/
│     ├─ app.component.ts
│     ├─ app.component.html
│     ├─ app.component.css
│     ├─ app.component.spec.ts
│     ├─ app.config.ts
│     ├─ models/
│     │  └─ medicine.model.ts
│     ├─ services/
│     │  └─ medicine.service.ts
│     └─ components/
│        ├─ image-upload/
│        │  └─ image-upload.component.ts
│        ├─ result-card/
│        │  └─ result-card.component.ts
│        ├─ seller-info/
│        │  └─ seller-info.component.ts
│        └─ ai-explanation/
│           └─ ai-explanation.component.ts
└─ server/
   ├─ package.json
   ├─ server.js
   ├─ eng.traineddata
   ├─ ocr-parser-isolation-test.js
   └─ services/
      ├─ ocr.service.js
      ├─ quality.service.js
      └─ vision.service.js
```

### 2.1 Frontend structure details

- src/main.ts
  - Angular bootstrap entrypoint using bootstrapApplication.
  - Starts AppComponent with providers from app.config.ts.

- src/app/app.config.ts
  - Registers provideHttpClient() globally.
  - Enables HttpClient usage in MedicineService.

- src/app/app.component.ts
  - Root standalone component.
  - Hosts the page layout (header, uploader, result panel, AI explanation, seller panel, footer).
  - Uses ChangeDetectionStrategy.OnPush for optimized re-rendering.
  - Handles result events from child components and populates state.

- src/app/components/image-upload/image-upload.component.ts
  - Handles image selection (file picker + drag and drop).
  - Validates file count/type/size.
  - Converts files to base64 via FileReader.
  - Calls MedicineService.verifyMedicine with single or multiple images.
  - Uses RxJS operators for sequencing and UX timing:
    - from, concatMap, toArray for multi-file conversion
    - switchMap for API call chaining
    - timer/map for minimum spinner timing
    - finalize for loading state cleanup
    - takeUntil + Subject for destroy-safe subscriptions

- src/app/components/result-card/result-card.component.ts
  - Visualizes authenticity score and summary.
  - Displays red flags and confidence values.
  - Displays OCR extracted fields and FDA matching info.
  - Supports model summary rendering from model_used payload.
  - Animates score ring using requestAnimationFrame.

- src/app/components/ai-explanation/ai-explanation.component.ts
  - Renders explainability cards from ai_explanations array.
  - Visual focus on user transparency and trust.

- src/app/components/seller-info/seller-info.component.ts
  - Shows mock seller trust/rating metadata.
  - Trust bar and card animations for supporting UX context.

- src/app/services/medicine.service.ts
  - Frontend API integration layer.
  - Builds endpoint from environment values.
  - Performs input guardrails:
    - empty input check
    - max payload size check
    - supported data URL check
  - Posts to backend verify endpoint.
  - Applies timeout and fallback result via RxJS catchError.

- src/app/models/medicine.model.ts
  - Contract definitions for frontend/backend payload agreement.
  - Includes result, red flags, OCR fields, FDA metadata, and model usage details.

- src/styles.css
  - Tailwind directives are included.
  - Global design tokens and custom UI language (glassmorphism, gradients, animation) are defined here.

- src/environments/environment.ts and environment.development.ts
  - Defines backend API base URL and verification path.

- src/app/app.component.html and app.component.css
  - Intentionally empty because template/styles are inline in app.component.ts.

- src/app/app.component.spec.ts
  - Default Angular unit test file.
  - Contains scaffold tests that do not fully match the current custom root component behavior.

### 2.2 Backend structure details

- server/server.js
  - Main Express API server.
  - Parses JSON payloads up to 50 MB.
  - Enables CORS.
  - Provides endpoints:
    - POST /api/verify-medicine
    - GET /api/health
  - Implements core multi-stage verification pipeline:
    1. Decode image
    2. Deterministic quality gate (Sharp)
    3. OCR extraction (Tesseract service)
    4. OCR text validations and anti-counterfeit heuristics
    5. Optional openFDA label cross-reference
    6. Gemini vision analysis
    7. Weighted scoring and response shaping
    8. Multi-image aggregation support

- server/services/ocr.service.js
  - Uses Sharp preprocessing + tesseract.js OCR.
  - Returns normalized OCR payload shape (text, confidence, source).

- server/services/quality.service.js
  - Uses Sharp statistics/metadata.
  - Performs deterministic checks:
    - minimum resolution
    - brightness threshold
    - blur proxy (entropy)
    - color variance check
  - Returns gate result, reasons, metrics, and quality issues.

- server/services/vision.service.js
  - Uses @google/generative-ai SDK with Gemini 1.5 Flash vision model.
  - Sends strict JSON prompt for packaging forensics.
  - Converts model output into normalized issue array and authenticity score.
  - Includes graceful degradation on API failure.

- server/ocr-parser-isolation-test.js
  - Local parser test harness for OCR field extraction heuristics.
  - Useful for quick non-HTTP logic checks.

- server/eng.traineddata
  - Tesseract language data artifact for English OCR.

## 3) Frontend library stack (root package.json)

### 3.1 Runtime dependencies and how they are used

| Library | Version | Role in project | Current usage in code |
|---|---:|---|---|
| @angular/animations | ^17.3.12 | Angular animation package | Installed with Angular suite; UI effects are currently mostly CSS-based, not Angular animation DSL based. |
| @angular/common | ^17.3.12 | Core directives/common utilities | Used via CommonModule in standalone components for structural directives like ngIf/ngFor. |
| @angular/compiler | ^17.3.12 | Angular template compiler | Required by Angular build/runtime toolchain. |
| @angular/core | ^17.3.12 | Angular framework core | Used by all components/services/decorators and app bootstrapping. |
| @angular/forms | ^17.3.12 | Angular forms API | Installed; current uploader flow is native file input driven, not FormsModule-heavy. |
| @angular/platform-browser | ^17.3.12 | Browser platform runtime | Required for browser app execution. |
| @angular/platform-browser-dynamic | ^17.3.12 | JIT/browser dynamic platform support | Included by Angular stack; app bootstraps with standalone API from platform-browser. |
| @angular/router | ^17.3.12 | Routing framework | Installed; current app appears single-page/no route config. |
| rxjs | ~7.8.0 | Reactive streams library | Used in uploader/service pipelines for conversion, timing, API orchestration, and error handling. |
| tslib | ^2.3.0 | TypeScript helper runtime | Compiler/runtime helper dependency used by TS-transpiled Angular code. |
| zone.js | ~0.14.3 | Angular async change tracking zone | Included in Angular polyfills and test config; supports Angular change detection lifecycle. |

### 3.2 Development and build dependencies

| Library | Version | Role in project | Current usage |
|---|---:|---|---|
| @angular-devkit/build-angular | ^17.3.17 | Angular build system | Used by build/serve/test targets in angular.json. |
| @angular/cli | ^17.3.17 | Angular CLI tooling | Used for ng serve/ng build/ng test scripts. |
| @angular/compiler-cli | ^17.3.12 | Angular TS compilation tooling | Used in compile/build pipeline. |
| @types/jasmine | ~5.1.0 | Jasmine TS typings | Used by test compilation setup. |
| jasmine-core | ~5.1.0 | Test framework core | Unit testing framework in Angular default setup. |
| karma | ~6.4.0 | Browser test runner | Used by ng test target. |
| karma-chrome-launcher | ~3.2.0 | Launch Chrome in Karma | Browser launcher for unit tests. |
| karma-coverage | ~2.2.0 | Coverage reporting | Enables test coverage in Karma. |
| karma-jasmine | ~5.1.0 | Jasmine adapter for Karma | Connects Jasmine to Karma runner. |
| karma-jasmine-html-reporter | ~2.1.0 | Browser reporter UI | HTML output for local test runs. |
| tailwindcss | ^3.4.19 | Utility CSS framework | Enabled in PostCSS and imported in global styles; project mainly uses custom CSS with tokenized style language. |
| postcss | ^8.5.8 | CSS transform pipeline | Executes Tailwind + Autoprefixer pipeline. |
| autoprefixer | ^10.4.27 | Vendor prefixing | Auto-prefixes generated CSS for browser compatibility. |
| typescript | ~5.4.2 | TS compiler | Core compile-time language support. |

## 4) Backend library stack (server/package.json)

| Library | Version | Role in project | Current usage in code |
|---|---:|---|---|
| express | ^4.18.2 | HTTP API server | Defines routes, middleware, and server lifecycle in server.js. |
| cors | ^2.8.5 | Cross-origin support | Enabled globally for frontend-backend communication. |
| dotenv | ^16.3.1 | Environment variable loading | Loads GEMINI_API_KEY, HF token aliases, and PORT from environment. |
| axios | ^1.6.0 | HTTP client | Calls Hugging Face VQA/CLIP endpoints and openFDA API; used with timeouts and headers. |
| sharp | ^0.34.5 | Image preprocessing and metrics | Used for OCR preprocessing, quality gate, metadata/stats, entropy, and print variance checks. |
| tesseract.js | ^7.0.0 | OCR engine | Local OCR extraction fallback/main OCR path in ocr.service.js. |
| @google/generative-ai | ^0.24.1 | Gemini SDK | Executes vision-based packaging authenticity analysis in vision.service.js. |

## 5) Build, test, and toolchain configuration

### 5.1 Angular workspace and targets

- angular.json configures one application project: medi-verify.
- Build system uses @angular-devkit/build-angular:application.
- Serve defaults to development configuration.
- Development config replaces environment.ts with environment.development.ts.
- Test target uses Karma and zone.js/testing polyfills.

### 5.2 Scripts

Root scripts:

- npm start -> ng serve
- npm run build -> ng build
- npm run watch -> ng build --watch --configuration development
- npm test -> ng test

Backend scripts (server/package.json):

- npm start -> node server.js
- npm run dev -> node server.js

### 5.3 TypeScript strictness

tsconfig.json enables strict mode and additional safety options:

- strict: true
- noImplicitReturns: true
- noFallthroughCasesInSwitch: true
- strict Angular template/injection checks

## 6) Runtime architecture and request flow

## 6.1 Browser to backend flow

1. User uploads one or multiple medicine images in ImageUploadComponent.
2. Files are validated locally (count, size, type).
3. Files are converted to base64 data URLs.
4. MedicineService sends payload to POST /api/verify-medicine.
5. Backend analyzes each image individually and aggregates if multiple images are sent.
6. Frontend renders authenticity score, red flags, OCR evidence, FDA signal, and AI explanations.

## 6.2 Backend analysis pipeline per image

1. Input normalization
   - Remove data URL prefix and decode base64.

2. Deterministic quality gate (Sharp)
   - Reject/flag low resolution, dark, or blurry images using numeric thresholds.

3. OCR extraction (Tesseract service)
   - Preprocess with greyscale/normalize/sharpen.
   - OCR reads text and confidence.

4. Deterministic text heuristics
   - Batch/expiry/dosage/drug/manufacturer parsing.
   - Expiry validation against current date.
   - Duplicate text pattern detection.
   - Unexpected script/language detection.
   - Orientation anomaly checks via rotated OCR.
   - Known-drug heuristic check.

5. Regulatory cross-reference
   - Extracted drug name checked against openFDA label metadata.

6. Vision model analysis (Gemini)
   - Packaging-only forensic prompt.
   - Returns structured PASS/ISSUE/UNCLEAR statuses + visual authenticity score.

7. Score fusion
   - Combines visual score, deterministic quality score, and text issue weighting.
   - Produces final authenticity_score and summary category.

8. Response shaping
   - Returns UI-ready format with red_flags, ai_explanations, ocr, fda, model_used.

## 7) API contracts and integration points

### 7.1 Backend endpoints

- POST /api/verify-medicine
  - Request body supports:
    - { image: string } for single image
    - { images: string[] } for multiple images
  - Response includes aggregated or single-image analysis payload.

- GET /api/health
  - Returns service liveness status and timestamp.

### 7.2 Environment variables

Backend expected environment variables:

- PORT (optional, default 5000)
- GEMINI_API_KEY (required for Gemini vision analysis)
- HF_TOKEN or HF_API_TOKEN (used by Hugging Face calls in server.js helper functions)

Frontend environment files provide:

- apiBaseUrl (http://localhost:5000)
- verifyMedicinePath (/api/verify-medicine)

## 8) Data model design (frontend/backend contract)

Primary response object fields:

- authenticity_score: number
- red_flags: array of { flag, confidence }
- summary: short verdict text
- ai_explanations: explainability cards
- ocr: extracted text, parsed fields, validation issues
- fda: openFDA match and metadata
- model_used: model origin metadata used by UI model summary

The frontend TypeScript interfaces in medicine.model.ts align with this payload shape.

## 9) Styling and UX stack

- Tailwind directives are present in global CSS and build pipeline.
- Actual UI implementation is largely custom CSS with:
  - design tokens via CSS variables
  - glassmorphism cards
  - animated gradient background and floating orbs
  - component-level inline styles in standalone components
  - requestAnimationFrame-driven score/trust animations

This gives a custom visual identity while still keeping Tailwind available for utility usage.

## 10) Notes on current implementation state

- The README describes Hugging Face TrOCR fallback behavior, while current OCR service code uses local Tesseract.js directly as OCR path.
- server.js still contains helper functions for BLIP/ViLT/CLIP Hugging Face flows, but the active visual analysis path is Gemini-based service integration.
- app.component.spec.ts appears to contain default scaffold tests expecting a title property/template that no longer reflect the current inline app component.

These are not blocking for runtime, but they are useful to track as maintenance alignment items.

## 11) Summary

Medi-Verify currently operates as a hybrid AI + deterministic verification system:

- Angular frontend for image input, stateful UX, and explainable result rendering
- Express backend for orchestration and analysis
- Gemini for visual forensic checks
- Tesseract + Sharp for OCR and deterministic quality logic
- openFDA for lightweight regulatory signal enrichment

The stack is practical for demos and prototypes, with clear separation between UI, transport, AI inference, and deterministic validation rules.
