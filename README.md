# Ollama LLM Control Panel & Chat UI

A premium, high-performance React dashboard for managing and chatting with local Large Language Models (LLMs) via **Ollama**.

## 🚀 Overview

This system is a private, local-first AI workspace. It connects directly to your local Ollama instance, allowing you to run models like DeepSeek, Llama 3, Qwen, and Phi-3 with full data privacy.

### Key Features

- **🧠 Real-time Model Management**: Monitor VRAM usage, load status, and speeds of all your local models in one sidebar.
- **💬 Persistent Chat History**: All conversations are automatically saved to **IndexedDB** (browser database). They survive page reloads and browser restarts.
- **⚡ Dual AI Mode**: Select multiple models to compare their responses side-by-side in real-time.
- **🖼️ Multimodal Vision Support**: Full image analysis support for vision-capable models (like Gemma 3).
- **📂 Document & Context Upload**: Attach text files (.txt, .md, .csv) or images to your prompts for context-aware responses.
- **🌓 Premium Dark Mode**: High-contrast, glassmorphic design optimized for long coding/research sessions.
- **📶 Connection Monitoring**: Real-time pinging of the Ollama API to ensure connectivity.

## 📋 Requirements

To run this system, you **must** have [Ollama](https://ollama.com/) installed and the following models pulled to your local machine:

```bash
# Required Models Installation
ollama pull llama3:8b
ollama pull qwen2.5:7b
ollama pull deepseek-r1:8b
ollama pull phi3:latest
ollama pull qwen2.5-coder:1.5b-base
ollama pull gemma3:12b-it-q8_0
ollama pull nomic-embed-text:latest
```

## 🛠️ Technology Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS (v4), Lucide Icons
- **Database**: IndexedDB (via `idb` library) for persistent local storage
- **API**: Ollama REST API (proxied via Vite to bypass CORS)

## 📦 Getting Started

### Prerequisites

1.  **Install Ollama**: Download and install from [ollama.com](https://ollama.com/).
2.  **Download Models**: Run `ollama run llama3`, `ollama run deepseek-r1:8b`, etc., to populate your library.

### Installation

1.  **Clone/Download** the repository.
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Start the development server**:
    ```bash
    npm run dev
    ```
4.  **Open in Browser**: Navigate to `http://localhost:5173`.

## 📂 Project Structure

- `src/app/App.tsx`: Main application entry and state management.
- `src/app/components/ModelSidebar.tsx`: The control panel for monitoring and selecting LLMs.
- `src/app/components/ChatWorkspace.tsx`: The primary messaging interface with history integration.
- `src/app/components/TaskPanel.tsx`: Task routing and interaction mode settings.
- `src/app/services/ollama.ts`: API service for streaming and model discovery.
- `src/app/services/chatHistory.ts`: IndexedDB persistence layer.

## 💡 How it Works

### Chat Persistence
Unlike basic chat UIs, this system implements a structured database using **IndexedDB**. 
- **Auto-Title**: The system generates a title for your chat based on your first message.
- **Auto-Save**: Every token received from Ollama is persisted to the local database immediately.
- **Offline Access**: You can browse your chat history even if the Ollama server is offline.

### Dual AI Mode
When enabled via the Task Router, you can select multiple checkboxes in the sidebar. Sending a message will trigger parallel streaming requests to all selected models, allowing for instant performance and logic comparison.

---
