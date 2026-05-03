"""
Local LLM Backend Server — FastAPI + llama-cpp-python.

Exposes an Ollama-compatible REST API so the React frontend needs
minimal changes.  Models are GGUF files stored in ../models/ and
auto-downloaded from HuggingFace on first use.

All endpoints are served under the /controlpanelEflow/ prefix.
Every request must include  Authorization: Bearer <API_KEY>.

The API key is fetched from Firebase Realtime Database at the path
specified in FIREBASE_AUTHKEY_PATH (default: "config/authKey").

Endpoints (under /controlpanelEflow)
────────────────────────────────────
GET  /api/health        — liveness check
GET  /api/tags          — list available models (Ollama /api/tags format)
GET  /api/ps            — currently loaded model  (Ollama /api/ps format)
POST /api/chat          — streaming chat completion (NDJSON, Ollama format)
POST /api/download      — trigger model download
GET  /AUTHKEY           — fetch API key (no auth required)
"""

import os
import gc
import json
import time
import asyncio
import logging
import aiohttp
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from model_registry import (
    ModelEntry,
    get_model,
    list_all_models,
    download_model,
)
from server_logging import (
    LogBuffer,
    SSEManager,
    FirebaseLogWriter,
    BufferAndBroadcastHandler,
    make_entry,
    LOG_TYPE_CHAT,
)

# ── Load environment variables ────────────────────────────────────────
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Firebase Realtime Database REST API configuration
FIREBASE_DATABASE_URL: str = os.getenv("VITE_FIREBASE_DATABASE_URL", "")
FIREBASE_DB_AUTH_TOKEN: str = os.getenv("FIREBASE_DB_AUTH_TOKEN", "")
FIREBASE_AUTHKEY_PATH: str = (
    "AUTHKEY"  # Path in database where auth key is stored
)

if not FIREBASE_DATABASE_URL:
    raise RuntimeError("VITE_FIREBASE_DATABASE_URL not set in .env!")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
)
logger = logging.getLogger(__name__)

# ── Server-wide logging infrastructure ────────────────────────────────
log_buffer = LogBuffer(maxlen=500)
sse_manager = SSEManager()
firebase_log_writer = FirebaseLogWriter(
    database_url=FIREBASE_DATABASE_URL,
    auth_token=FIREBASE_DB_AUTH_TOKEN,
)

# Attach the custom handler to the root logger so we capture everything
# (uvicorn, our app, llama-cpp, etc.)
_handler = BufferAndBroadcastHandler(
    log_buffer=log_buffer,
    sse_manager=sse_manager,
    firebase_writer=firebase_log_writer,
)
_handler.setFormatter(logging.Formatter("%(asctime)s  %(levelname)-8s  %(message)s"))
logging.getLogger().addHandler(_handler)

# Also attach to uvicorn loggers explicitly
for _uvi_name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
    logging.getLogger(_uvi_name).addHandler(_handler)

logger.info(f"Firebase Database: {FIREBASE_DATABASE_URL}")
logger.info(f"Auth Key Path: {FIREBASE_AUTHKEY_PATH}")


# ── API Key Cache (to avoid constant DB reads) ────────────────────────
_api_key_cache = {"value": None, "timestamp": 0, "ttl_seconds": 300}  # 5 min TTL


async def get_cached_api_key() -> Optional[str]:
    """Fetch API key from Firebase Realtime Database using REST API."""
    import time

    current_time = time.time()

    # Return cached key if still valid
    if (
        _api_key_cache["value"]
        and (current_time - _api_key_cache["timestamp"]) < _api_key_cache["ttl_seconds"]
    ):
        return _api_key_cache["value"]

    # Fetch from Firebase Realtime Database REST API
    try:
        auth_query = f"?auth={FIREBASE_DB_AUTH_TOKEN}" if FIREBASE_DB_AUTH_TOKEN else ""
        url = f"{FIREBASE_DATABASE_URL.rstrip('/')}/{FIREBASE_AUTHKEY_PATH}.json{auth_query}"
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status == 200:
                    api_key = await resp.text()
                    # Remove quotes if present
                    api_key = api_key.strip('"')
                    if api_key:
                        _api_key_cache["value"] = api_key
                        _api_key_cache["timestamp"] = current_time
                        logger.debug(
                            f"Fetched auth key from Firebase: {FIREBASE_AUTHKEY_PATH}"
                        )
                        return api_key
    except Exception as e:
        logger.error(f"Failed to fetch API key from Firebase: {e}")

    # Return cached value even if expired, as fallback
    if _api_key_cache["value"]:
        logger.warning("Using stale cached API key")
        return _api_key_cache["value"]

    return None


# ── Firebase API-key auth middleware ──────────────────────────────────


class FirebaseKeyAuthMiddleware(BaseHTTPMiddleware):
    """
    Reject any request that does not carry
    Authorization: Bearer <FIREBASE_API_KEY>.
    """

    async def dispatch(self, request: Request, call_next):
        # Let CORS preflight through — browsers send OPTIONS without auth
        if request.method == "OPTIONS":
            return await call_next(request)

        # Allow unauthenticated access to auth key, health, and log stream endpoints
        if request.url.path.endswith(("/AUTHKEY", "/api/authkey", "/api/health", "/api/logs/stream")):
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        expected_key = await get_cached_api_key()

        if not expected_key:
            return JSONResponse(
                {"error": "Unauthorized – API key not available"},
                status_code=401,
            )

        if not auth_header.startswith("Bearer ") or auth_header[7:] != expected_key:
            return JSONResponse(
                {"error": "Unauthorized – invalid or missing API key"},
                status_code=401,
            )
        return await call_next(request)


# ── Global model state ────────────────────────────────────────────────


class ModelManager:
    """Manages loading / unloading a single model at a time."""

    def __init__(self):
        self._llm = None  # Llama instance
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
            "n_threads": None,  # auto-detect
            "chat_format": entry.chat_format,
            "verbose": False,
            "n_gpu_layers": 99,  # whole model onto GPU
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

# ── Disabled models set (controlled from the frontend) ────────────────
disabled_models: set[str] = set()

# ── FastAPI app ───────────────────────────────────────────────────────

ROUTE_PREFIX = "/controlpanelEflow"


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("LLM Backend starting …")
    logger.info(f"Route prefix : {ROUTE_PREFIX}")
    logger.info(f"Registered models: {[m.tag for m in list_all_models()]}")
    yield
    manager.unload()
    logger.info("LLM Backend shut down.")
    await firebase_log_writer.close()


app = FastAPI(title="Local LLM Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth middleware — applied after CORS so preflight OPTIONS still works
app.add_middleware(FirebaseKeyAuthMiddleware)

# All routes go on a sub-router mounted at /controlpanelEflow
router = APIRouter()


# ── Health ────────────────────────────────────────────────────────────


@router.get("/api/health")
async def health():
    return {"status": "ok"}


# ── Model Toggle (enable/disable) ────────────────────────────────────


@router.put("/api/models/toggle")
async def toggle_model(request: Request):
    """Enable or disable a model. Disabled models reject chat requests."""
    body = await request.json()
    model_tag = body.get("model", "")
    enabled = body.get("enabled", True)

    entry = get_model(model_tag)
    if not entry:
        return JSONResponse({"error": f"Unknown model: {model_tag}"}, status_code=404)

    if enabled:
        disabled_models.discard(model_tag)
        logger.info(f"Model {model_tag} enabled via control panel")
    else:
        disabled_models.add(model_tag)
        logger.info(f"Model {model_tag} disabled via control panel")

    return {
        "model": model_tag,
        "enabled": enabled,
        "disabled_models": list(disabled_models),
    }


@router.get("/api/models/status")
async def models_status():
    """Return the current enabled/disabled state of all models."""
    return {
        "disabled_models": list(disabled_models),
    }


# ── Server Log Stream (SSE) ───────────────────────────────────────────


@router.get("/api/logs/stream")
async def log_stream():
    """Server-Sent Events endpoint that streams live server logs."""
    queue = sse_manager.subscribe()

    async def event_generator():
        # Send backlog first so the client has context
        for entry in log_buffer.snapshot():
            yield f"data: {json.dumps(entry)}\n\n"

        # Then stream live
        try:
            while True:
                entry = await queue.get()
                yield f"data: {json.dumps(entry)}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            sse_manager.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Get Auth Key ───────────────────────────────────────────────────────


@router.get("/AUTHKEY")
async def get_auth_key():
    """Returns the API key from Firebase Realtime Database."""
    api_key = await get_cached_api_key()
    if not api_key:
        return JSONResponse(
            {"error": "Failed to retrieve API key"},
            status_code=500,
        )
    return {"api_key": api_key}


@router.get("/api/authkey")
async def get_auth_key_api():
    """Alias for /AUTHKEY to support /api proxy paths."""
    return await get_auth_key()


@router.put("/api/authkey")
async def update_auth_key(request: Request):
    """Update the API key in Firebase Realtime Database."""
    body = await request.json()
    new_key = body.get("api_key", "")
    if not new_key or not isinstance(new_key, str) or len(new_key) < 4:
        return JSONResponse(
            {"error": "Invalid API key — must be at least 4 characters"},
            status_code=400,
        )

    try:
        auth_query = f"?auth={FIREBASE_DB_AUTH_TOKEN}" if FIREBASE_DB_AUTH_TOKEN else ""
        url = f"{FIREBASE_DATABASE_URL.rstrip('/')}/{FIREBASE_AUTHKEY_PATH}.json{auth_query}"
        async with aiohttp.ClientSession() as session:
            async with session.put(
                url,
                json=new_key,
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                if resp.status >= 400:
                    body_text = await resp.text()
                    logger.error(f"Failed to update auth key in Firebase: {resp.status} {body_text}")
                    return JSONResponse(
                        {"error": f"Firebase write failed: {resp.status}"},
                        status_code=500,
                    )

        # Invalidate cache so the new key is picked up immediately
        _api_key_cache["value"] = new_key
        _api_key_cache["timestamp"] = time.time()
        logger.info("Auth key updated successfully via control panel")

        return {"status": "ok", "message": "Auth key updated"}
    except Exception as e:
        logger.exception("Failed to update auth key")
        return JSONResponse({"error": str(e)}, status_code=500)


# ── List models (Ollama /api/tags format) ─────────────────────────────


@router.get("/api/tags")
async def list_models():
    models_out = []
    for entry in list_all_models():
        models_out.append(
            {
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
            }
        )
    return {"models": models_out}


# ── Running models (Ollama /api/ps format) ────────────────────────────


@router.get("/api/ps")
async def running_models():
    models_out = []
    if manager.loaded_tag:
        entry = get_model(manager.loaded_tag)
        if entry:
            models_out.append(
                {
                    "name": entry.tag,
                    "model": entry.tag,
                    "size": entry.size_bytes,
                    "size_vram": entry.size_bytes,
                    "expires_at": "",
                }
            )
    return {"models": models_out}


# ── Download model ────────────────────────────────────────────────────


@router.post("/api/download")
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


@router.post("/api/chat")
@router.post("/api/chat/{model_tag:path}")
async def chat(request: Request, model_tag: Optional[str] = None):
    body = await request.json()
    model_tag = model_tag or body.get("model", "")
    messages = body.get("messages", [])
    stream = body.get("stream", True)

    entry = get_model(model_tag)
    if not entry:
        return JSONResponse(
            {"error": f"Unknown model: {model_tag}"},
            status_code=404,
        )

    # Check if model is disabled via control panel
    if model_tag in disabled_models:
        return JSONResponse(
            {"error": f"Model {model_tag} is currently disabled"},
            status_code=403,
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
        chat_messages.append(
            {
                "role": msg.get("role", "user"),
                "content": msg.get("content", ""),
            }
        )

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

    content = (
        result["choices"][0]["message"]["content"] if result.get("choices") else ""
    )
    eval_count = result.get("usage", {}).get("completion_tokens", 0)
    total_duration = time.time_ns() - start
    latency_ms = total_duration / 1_000_000

    # Log usage to Firebase
    usage_entry = make_entry(
        message=f"Chat completion: {model_tag} — {eval_count} tokens in {latency_ms:.0f}ms",
        level="INFO",
        source="chat",
        log_type=LOG_TYPE_CHAT,
        extra={
            "model": model_tag,
            "tokens": eval_count,
            "latency_ms": round(latency_ms),
            "stream": False,
        },
    )
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(firebase_log_writer.write(usage_entry))
        loop.create_task(sse_manager.broadcast(usage_entry))
    except RuntimeError:
        pass
    log_buffer.push(usage_entry)

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
                line = json.dumps(
                    {
                        "model": model_tag,
                        "message": {"role": "assistant", "content": token},
                        "done": False,
                    }
                )
                yield line + "\n"
    except Exception as e:
        logger.exception("Streaming error")
        error_line = json.dumps(
            {
                "model": model_tag,
                "message": {"role": "assistant", "content": f"\n\n⚠️ Error: {e}"},
                "done": True,
            }
        )
        yield error_line + "\n"
        return

    total_duration = time.time_ns() - start
    latency_ms = total_duration / 1_000_000

    # Log usage to Firebase
    usage_entry = make_entry(
        message=f"Chat completion: {model_tag} — {eval_count} tokens in {latency_ms:.0f}ms",
        level="INFO",
        source="chat",
        log_type=LOG_TYPE_CHAT,
        extra={
            "model": model_tag,
            "tokens": eval_count,
            "latency_ms": round(latency_ms),
            "stream": True,
        },
    )
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(firebase_log_writer.write(usage_entry))
        loop.create_task(sse_manager.broadcast(usage_entry))
    except RuntimeError:
        pass
    log_buffer.push(usage_entry)

    done_line = json.dumps(
        {
            "model": model_tag,
            "message": {"role": "assistant", "content": ""},
            "done": True,
            "total_duration": total_duration,
            "eval_count": eval_count,
        }
    )
    yield done_line + "\n"


# ── Mount router under prefix ─────────────────────────────────────────

app.include_router(router, prefix=ROUTE_PREFIX)


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
                capture_output=True,
                text=True,
                timeout=5,
            )
            for line in result.stdout.splitlines():
                if f":{port}" in line and "LISTENING" in line:
                    parts = line.strip().split()
                    pid = int(parts[-1])
                    logger.info(f"Killing old process PID {pid} on port {port}")
                    subprocess.run(
                        ["taskkill", "/F", "/PID", str(pid)],
                        capture_output=True,
                        timeout=5,
                    )
        else:
            # Unix: use lsof
            result = subprocess.run(
                ["lsof", "-ti", f":{port}"],
                capture_output=True,
                text=True,
                timeout=5,
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
        host="0.0.0.0",
        port=8321,
        log_level="info",
    )
