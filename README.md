# Local LLM Control Panel & Chat UI

A premium, high-performance React dashboard for managing and chatting with local Large Language Models (LLMs) — **no Ollama required**.

## 🚀 Overview

This system is a private, local-first AI workspace. It runs LLM models directly using a built-in Python backend powered by `llama-cpp-python`. Models are automatically downloaded from HuggingFace on first use — just run one command and start chatting.

### Key Features

- **🧠 Self-Contained Backend**: No external tools needed. The system downloads and runs GGUF models directly.
- **💬 Persistent Chat History**: All conversations are automatically saved to **IndexedDB** (browser database). They survive page reloads and browser restarts.
- **⚡ Dual AI Mode**: Select multiple models to compare their responses side-by-side in real-time.
- **📂 Document & Context Upload**: Attach text files (.txt, .md, .csv) to your prompts for context-aware responses.
- **🔄 Hot-Swap Models**: Switch between models instantly — the backend loads/unloads models on the fly.
- **🌓 Premium Dark Mode**: High-contrast, glassmorphic design optimized for long coding/research sessions.
- **📶 Connection Monitoring**: Real-time backend health checking.

## 📋 Requirements

- **Python 3.10+** — [Download Python](https://www.python.org/downloads/)
- **Node.js 18+** — [Download Node.js](https://nodejs.org/)
- **8 GB+ RAM** — 16 GB recommended for larger models

### Included Models (auto-downloaded on first use)

| Model | Size | Purpose |
|-------|------|---------|
| Llama 3 8B | ~4.7 GB | General chat |
| DeepSeek R1 8B | ~4.9 GB | Advanced reasoning |
| Qwen 2.5 7B | ~4.4 GB | Balanced chat |
| Phi-3 Mini | ~2.2 GB | Fast responses |

## 🛠️ Technology Stack

- **Frontend**: React 18, TypeScript, Vite
- **Backend**: Python, FastAPI, llama-cpp-python
- **Styling**: Tailwind CSS (v4), Lucide Icons
- **Database**: IndexedDB (via `idb` library) for persistent local storage
- **Models**: GGUF format, auto-downloaded from HuggingFace

## 📦 Getting Started

### Installation

1.  **Clone/Download** the repository.
2.  **Install frontend dependencies**:
    ```bash
    npm install
    ```
3.  **Start everything** (backend + frontend):
    ```bash
    npm run dev
    ```

That's it! On the first run, the system will:
- Create a Python virtual environment (`server/.venv/`)
- Install Python dependencies (`fastapi`, `llama-cpp-python`, etc.)
- Start the backend on port 8321
- Start the frontend on port 5173

When you select a model and send a message, it will be **automatically downloaded** from HuggingFace (~2-5 GB per model) on first use.

### Alternative: Run components separately

```bash
# Terminal 1 — Backend
npm run dev:backend

# Terminal 2 — Frontend only
npm run dev:frontend-only
```

## 📂 Project Structure

- `src/app/App.tsx`: Main application entry and state management.
- `src/app/components/ModelSidebar.tsx`: The control panel for monitoring and selecting LLMs.
- `src/app/components/ChatWorkspace.tsx`: The primary messaging interface with history integration.
- `src/app/components/TaskPanel.tsx`: Task routing and interaction mode settings.
- `src/app/services/llm.ts`: API service for streaming chat and model discovery.
- `src/app/services/chatHistory.ts`: IndexedDB persistence layer.
- `server/main.py`: FastAPI backend server.
- `server/model_registry.py`: Model definitions and HuggingFace download manager.
- `server/start.py`: Auto-setup and launch script.
- `models/`: GGUF model files (auto-downloaded, git-ignored).

## 💡 How it Works

### Self-Contained Architecture

```
React Frontend (Vite :5173)  →  Vite Proxy (/api)  →  Python Backend (:8321)
                                                           ↓
                                                    llama-cpp-python
                                                           ↓
                                                    ./models/*.gguf
```

### Model Management
- Models are downloaded from HuggingFace on first use
- Only **one model** is loaded into memory at a time to save RAM
- Switching models automatically unloads the previous one
- Downloaded models are cached in `./models/` for future use

### Chat Persistence
- **Auto-Title**: The system generates a title for your chat based on your first message.
- **Auto-Save**: Every token received from the backend is persisted to the local database immediately.
- **Offline Access**: You can browse your chat history even if the backend is stopped.

### Dual AI Mode
When enabled via the Task Router, you can select multiple checkboxes in the sidebar. Sending a message will trigger parallel streaming requests to all selected models, allowing for instant performance and logic comparison.

---

## Summary — Getting GPU Working for llama-cpp-python

### The Goal
Remove Ollama dependency and run models locally via a Python/FastAPI server, with GPU acceleration instead of CPU.

### What Was Already Done (Before Today)
- Built a **FastAPI + llama-cpp-python** backend (`main.py`, `model_registry.py`)
- React frontend already talking to it — Ollama fully removed
- Problem: everything was running on **CPU only** → slow streaming

### What We Did Today

**1. Confirmed the problem**
```powershell
server\.venv\Scripts\python.exe -c "from llama_cpp import llama_supports_gpu_offload; print(llama_supports_gpu_offload())"
# Returned: False
```

**2. Confirmed CUDA Toolkit 12.4 was already installed** but not in system PATH so `nvcc` wasn't recognized

**3. Added CUDA to permanent system PATH**
```powershell
[System.Environment]::SetEnvironmentVariable("PATH", $env:PATH + ";C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.4\bin;C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.4\lib\x64", "Machine")
```

**4. Copied CUDA Visual Studio integration files** (needed for building — run as Admin)
```powershell
Copy-Item "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.4\extras\visual_studio_integration\MSBuildExtensions\*" -Destination "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Microsoft\VC\v170\BuildCustomizations\" -Force
```

**5. Installed the correct pre-built CUDA wheel** (skipped compiling since it kept hanging)
```powershell
server\.venv\Scripts\pip.exe install https://github.com/abetlen/llama-cpp-python/releases/download/v0.3.4-cu124/llama_cpp_python-0.3.4-cp312-cp312-win_amd64.whl --force-reinstall --no-cache-dir
```

**6. Verified GPU support working**
```powershell
server\.venv\Scripts\python.exe -c "from llama_cpp import llama_supports_gpu_offload; print(llama_supports_gpu_offload())"
# Returned: True ✅
```

### Why It Works Now
- `n_gpu_layers=99` was already in `main.py` — the code was always ready
- The missing piece was a **CUDA-enabled build** of `llama-cpp-python`
- Now the whole model loads into your **8GB VRAM** instead of RAM/CPU

### Start Your Server
```powershell
server\.venv\Scripts\python.exe server\main.py
```

## Software Installed Along the Way

**1. NVIDIA CUDA Toolkit 12.4**
- Downloaded from: `developer.nvidia.com/cuda-12-4-0-download-archive`
- What it does: Provides the CUDA compiler (`nvcc`) and runtime DLLs that llama-cpp-python needs to talk to the GPU

**2. Visual Studio 2022 Build Tools**
- Was already on your machine
- What it does: The C++ compiler (`cl.exe`) used to compile native code on Windows

**3. Git**
- Was already on your machine
- What it does: CMake uses it internally during the build process

### Python Packages Installed Into Your Venv

| Package | Version | Purpose |
|---|---|---|
| `llama-cpp-python` | 0.3.4 (cu124) | Runs GGUF models on GPU |
| `numpy` | 2.4.4 | Math arrays, dependency of llama-cpp |
| `diskcache` | 5.6.3 | Caching, dependency of llama-cpp |
| `jinja2` | 3.1.6 | Template engine, dependency of llama-cpp |
| `MarkupSafe` | 3.0.3 | Dependency of jinja2 |
| `typing-extensions` | 4.15.0 | Type hints backport |

The only **new thing actually installed on your system** was **CUDA Toolkit 12.4** — everything else was Python packages inside your existing virtual environment.
