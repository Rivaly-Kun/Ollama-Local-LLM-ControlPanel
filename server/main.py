"""
Local LLM Backend Server — FastAPI + llama-cpp-python.

Exposes an Ollama-compatible REST API so the React frontend needs
minimal changes.  Models are GGUF files stored in ../models/ and
auto-downloaded from HuggingFace on first use.

Endpoints
─────────
GET  /api/health        — liveness check
GET  /api/tags          — list available models (Ollama /api/tags format)
GET  /api/ps            — currently loaded model  (Ollama /api/ps format)
POST /api/chat          — streaming chat completion (NDJSON, Ollama format)
POST /api/download      — trigger model download
"""

import gc
import json
import time
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse

from model_registry import (
    ModelEntry,
    get_model,
    list_all_models,
    download_model,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
)
logger = logging.getLogger(__name__)


# ── Global model state ────────────────────────────────────────────────

class ModelManager:
    """Manages loading / unloading a single model at a time."""

    def __init__(self):
        self._llm = None           # Llama instance
        self._loaded_tag: Optional[str] = None

    @property
    def loaded_tag(self) -> Optional[str]:
        return self._loaded_tag

    @property
    def llm(self):
        return self._llm

    def load(self, entry: ModelEntry) -> None:
        """Load a model, unloading the previous one first."""
        if self._loaded_tag == entry.tag and self._llm is not None:
            logger.info(f"Model {entry.tag} already loaded — skipping")
            return

        self.unload()

        # Download if needed
        if not entry.is_downloaded:
            logger.info(f"Model {entry.tag} not found locally — downloading …")
            download_model(entry)

        if not entry.is_downloaded:
            raise RuntimeError(f"Model file missing after download: {entry.local_path}")

        # Import here so the module-level import doesn't crash if
        # llama-cpp-python isn't installed yet (for the start script).
        from llama_cpp import Llama

        logger.info(f"Loading model {entry.tag} from {entry.local_path} …")
        start = time.time()

        kwargs = {
            "model_path": str(entry.local_path),
            "n_ctx": entry.n_ctx,
            "n_threads": None,         # auto-detect
            "chat_format": entry.chat_format,
            "verbose": False,
            "n_gpu_layers": 99,        # whole model onto GPU
        }
        kwargs.update(entry.extra_kwargs)

        self._llm = Llama(**kwargs)
        self._loaded_tag = entry.tag
        elapsed = time.time() - start
        logger.info(f"Model {entry.tag} loaded in {elapsed:.1f}s")

    def unload(self) -> None:
        if self._llm is not None:
            logger.info(f"Unloading model {self._loaded_tag}")
            del self._llm
            self._llm = None
            self._loaded_tag = None
            gc.collect()


manager = ModelManager()

# ── FastAPI app ───────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("LLM Backend starting …")
    logger.info(f"Registered models: {[m.tag for m in list_all_models()]}")
    yield
    manager.unload()
    logger.info("LLM Backend shut down.")


app = FastAPI(title="Local LLM Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ── List models (Ollama /api/tags format) ─────────────────────────────

@app.get("/api/tags")
async def list_models():
    models_out = []
    for entry in list_all_models():
        models_out.append({
            "name": entry.tag,
            "model": entry.tag,
            "modified_at": "",
            "size": entry.size_bytes,
            "digest": "",
            "details": {
                "parent_model": "",
                "format": "gguf",
                "family": entry.family,
                "families": [entry.family] if entry.family else None,
                "parameter_size": entry.parameter_size,
                "quantization_level": entry.quantization,
            },
            # Extra fields for the frontend
            "downloaded": entry.is_downloaded,
        })
    return {"models": models_out}


# ── Running models (Ollama /api/ps format) ────────────────────────────

@app.get("/api/ps")
async def running_models():
    models_out = []
    if manager.loaded_tag:
        entry = get_model(manager.loaded_tag)
        if entry:
            models_out.append({
                "name": entry.tag,
                "model": entry.tag,
                "size": entry.size_bytes,
                "size_vram": entry.size_bytes,
                "expires_at": "",
            })
    return {"models": models_out}


# ── Download model ────────────────────────────────────────────────────

@app.post("/api/download")
async def trigger_download(request: Request):
    body = await request.json()
    tag = body.get("model", "")
    entry = get_model(tag)
    if not entry:
        return JSONResponse({"error": f"Unknown model: {tag}"}, status_code=404)

    try:
        download_model(entry)
        return {"status": "ok", "model": tag, "path": str(entry.local_path)}
    except Exception as e:
        logger.exception(f"Download failed for {tag}")
        return JSONResponse({"error": str(e)}, status_code=500)


# ── Chat completion (Ollama /api/chat format) ─────────────────────────

@app.post("/api/chat")
async def chat(request: Request):
    body = await request.json()
    model_tag = body.get("model", "")
    messages = body.get("messages", [])
    stream = body.get("stream", True)

    entry = get_model(model_tag)
    if not entry:
        return JSONResponse(
            {"error": f"Unknown model: {model_tag}"},
            status_code=404,
        )

    # Load the model if needed (swaps out any previously loaded model)
    try:
        manager.load(entry)
    except Exception as e:
        logger.exception(f"Failed to load model {model_tag}")
        return JSONResponse({"error": str(e)}, status_code=500)

    llm = manager.llm
    if llm is None:
        return JSONResponse({"error": "Model failed to load"}, status_code=500)

    # Build messages for llama-cpp-python
    chat_messages = []
    for msg in messages:
        chat_messages.append({
            "role": msg.get("role", "user"),
            "content": msg.get("content", ""),
        })

    if stream:
        return StreamingResponse(
            _stream_chat(llm, chat_messages, model_tag),
            media_type="application/x-ndjson",
        )
    else:
        return _sync_chat(llm, chat_messages, model_tag)


def _sync_chat(llm, messages: list[dict], model_tag: str):
    """Non-streaming chat completion."""
    start = time.time_ns()
    try:
        result = llm.create_chat_completion(messages=messages)
    except Exception as e:
        logger.exception("Chat completion error")
        return JSONResponse({"error": str(e)}, status_code=500)

    content = result["choices"][0]["message"]["content"] if result.get("choices") else ""
    eval_count = result.get("usage", {}).get("completion_tokens", 0)
    total_duration = time.time_ns() - start

    return {
        "model": model_tag,
        "message": {"role": "assistant", "content": content},
        "done": True,
        "total_duration": total_duration,
        "eval_count": eval_count,
    }


async def _stream_chat(llm, messages: list[dict], model_tag: str):
    """Streaming chat completion — yields Ollama-compatible NDJSON lines."""
    start = time.time_ns()
    eval_count = 0

    try:
        stream = llm.create_chat_completion(messages=messages, stream=True)
        for chunk in stream:
            delta = chunk.get("choices", [{}])[0].get("delta", {})
            token = delta.get("content", "")
            if token:
                eval_count += 1
                line = json.dumps({
                    "model": model_tag,
                    "message": {"role": "assistant", "content": token},
                    "done": False,
                })
                yield line + "\n"
    except Exception as e:
        logger.exception("Streaming error")
        error_line = json.dumps({
            "model": model_tag,
            "message": {"role": "assistant", "content": f"\n\n⚠️ Error: {e}"},
            "done": True,
        })
        yield error_line + "\n"
        return

    total_duration = time.time_ns() - start
    done_line = json.dumps({
        "model": model_tag,
        "message": {"role": "assistant", "content": ""},
        "done": True,
        "total_duration": total_duration,
        "eval_count": eval_count,
    })
    yield done_line + "\n"


# ── Main ──────────────────────────────────────────────────────────────

def _kill_port(port: int):
    """Kill any process currently using the given port (Windows + Unix)."""
    import platform
    import subprocess

    system = platform.system()
    try:
        if system == "Windows":
            # Use netstat to find the PID
            result = subprocess.run(
                ["netstat", "-ano", "-p", "TCP"],
                capture_output=True, text=True, timeout=5,
            )
            for line in result.stdout.splitlines():
                if f":{port}" in line and "LISTENING" in line:
                    parts = line.strip().split()
                    pid = int(parts[-1])
                    logger.info(f"Killing old process PID {pid} on port {port}")
                    subprocess.run(["taskkill", "/F", "/PID", str(pid)],
                                   capture_output=True, timeout=5)
        else:
            # Unix: use lsof
            result = subprocess.run(
                ["lsof", "-ti", f":{port}"],
                capture_output=True, text=True, timeout=5,
            )
            for pid_str in result.stdout.strip().split():
                pid = int(pid_str)
                logger.info(f"Killing old process PID {pid} on port {port}")
                import signal, os as _os
                _os.kill(pid, signal.SIGTERM)
    except Exception as e:
        logger.debug(f"Port cleanup note: {e}")


if __name__ == "__main__":
    import uvicorn

    _kill_port(8321)

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8321,
        log_level="info",
    )
