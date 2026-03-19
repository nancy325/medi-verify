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
   HF_API_TOKEN=your_hugging_face_token_here
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

## 🧠 How the AI Works

The AI verification system utilizes the `Salesforce/blip-image-captioning-large` (or similar visual-question-answering model on HF) pipeline.
1. The user uploads an image of a medicine on the frontend.
2. The Angular service serializes the image as base64 and posts it to our Node backend.
3. The Express handler translates the payload into a Hugging Face compatible prompt, asking specific visual questions (e.g., "Analyze the medicine packaging carefully. Is there a holographic seal? Is the text distorted?").
4. The BLIP-2 model responds with a structural analysis of the text and packaging features.
5. The backend parses this result, calculating an overall *"Authenticity Score"* and breaking down the reasoning into human-readable steps which are beautifully rendered in the Explanation Panel.

## 🤝 Contributing
Contributions are always welcome. Please make sure to follow the established code style and commit message conventions.

## 📄 License
This project is open-sourced under the [MIT License](LICENSE.md).
