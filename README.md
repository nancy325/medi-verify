# 🚀 Medi-Verify AI - Intelligent Medicine Authenticity Verification

Medi-Verify is a state-of-the-art web application designed to combat the issue of counterfeit medicines. Built with Angular on the frontend and Node.js/Express.js on the backend, it leverages the powerful **BLIP-2 (Bootstrapping Language-Image Pre-training)** Vision-Language AI model from Hugging Face for intelligent image analysis and authenticity verification.

## 🌟 Key Features

- **AI-Powered Medicine Verification**: Upload an image of a medicine package or bill, and our AI analyzes the packaging details, serial numbers, and text to determine authenticity.
- **Explainable AI Insights**: The application provides an *"AI Explanation Panel"* breaking down exactly why a medicine was flagged as authentic or counterfeit, including text recognized, visual features matched, and confidence levels.
- **Premium Glassmorphism UI**: A sleek, modern user interface built using vanilla CSS with complex glassmorphism effects, immersive background animations, and highly responsive components.
- **Real-Time Analysis**: Integrates a seamless backend processing pipeline using Axios + Hugging Face Inference API for low-latency predictions.

## 🛠️ Technology Stack

- **Frontend**: Angular 17+ (TypeScript, RxJS)
- **Styling**: Vanilla CSS (CSS Variables, Flexbox/Grid, Animations)
- **Backend API**: Node.js & Express.js
- **Artificial Intelligence**: BLIP-2 Vision-Language Model via Hugging Face Inference API

## 🚀 Getting Started

Follow these instructions to run the application locally.

### Prerequisites
- Node.js (v18+)
- Angular CLI
- Hugging Face API Token (Free tier works perfectly)

### 1. Backend Setup

1. Navigate to the `server` directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `server` directory and add your API credentials:
   ```env
   PORT=5000
   HF_TOKEN=your_hugging_face_token_here
   ```
4. Start the backend server:
   ```bash
   npm run dev
   ```
   *The backend will be running at `http://localhost:5000`.*

### 2. Frontend Setup

1. Open a new terminal and stay in the root project directory (`medi-verify`).
2. Install frontend dependencies:
   ```bash
   npm install
   ```
3. Start the Angular application:
   ```bash
   ng serve
   ```
4. Open your browser and navigate to `http://localhost:4200`.

### 3. Quick Run Flow (Recommended)

1. Start backend first (`server` folder):
   ```bash
   cd server
   npm run dev
   ```
2. In a second terminal, start frontend (project root):
   ```bash
   ng serve
   ```
3. Upload a medicine image in the UI and view the score + red flags.

## 🛟 Troubleshooting

### Warning: `HF_TOKEN not set — fallback mode active`

If you see this warning in backend logs, the app is running in fallback mode (mock/safe response) instead of live BLIP-2 analysis.

Checklist:
- Ensure `server/.env` exists
- Ensure the variable name is exactly `HF_TOKEN` (not `HF_API_TOKEN`)
- Ensure token value is not the placeholder (`your_hugging_face_token_here`)
- Restart backend after editing `.env`

Minimal `server/.env` example:

```env
PORT=5000
HF_TOKEN=hf_your_real_token_here
```

You can also copy from `server/.env.example` and then replace the token value.

## 🧠 How the AI Works

The AI verification system uses the `Salesforce/blip2-opt-2.7b` model via Hugging Face Inference API.
1. The user uploads an image of a medicine on the frontend.
2. The Angular service serializes the image as base64 and posts it to our Node backend.
3. The Express backend strips the data URI prefix, converts the payload to raw bytes, and sends it to BLIP-2 for image-to-text description generation.
4. BLIP-2 responds with generated text describing the visible packaging/image features.
5. The backend applies rule-based scoring on the generated description, returning an *"Authenticity Score"*, red flags, summary, and explanation cards.

## 🤝 Contributing
Contributions are always welcome. Please make sure to follow the established code style and commit message conventions.

## 📄 License
This project is open-sourced under the [MIT License](LICENSE.md).
