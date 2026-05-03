"""
Server Logging — ring buffer, Firebase persistence, and SSE broadcast.

Components
──────────
LogBuffer       Thread-safe ring buffer holding recent log entries.
FirebaseLogWriter   Pushes significant log entries to Firebase RTDB
                    at  ServerLogs/<YYYY-MM-DD>/<sanitised-timestamp>/
SSEManager      Manages connected SSE clients and broadcasts new entries.
"""

import asyncio
import json
import logging
import re
import time
from collections import deque
from datetime import datetime, timezone
from typing import Optional

import aiohttp

# ── Log entry type ────────────────────────────────────────────────────

LOG_TYPE_STARTUP   = "startup"
LOG_TYPE_SHUTDOWN  = "shutdown"
LOG_TYPE_MODEL     = "model_load"
LOG_TYPE_CHAT      = "chat_request"
LOG_TYPE_AUTH      = "auth"
LOG_TYPE_HEALTH    = "health"
LOG_TYPE_ERROR     = "error"
LOG_TYPE_GENERAL   = "general"

# Regex patterns used to auto-classify log messages
_PATTERNS: list[tuple[str, str]] = [
    (r"LLM Backend starting",           LOG_TYPE_STARTUP),
    (r"Route prefix",                    LOG_TYPE_STARTUP),
    (r"Registered models",              LOG_TYPE_STARTUP),
    (r"Application startup complete",   LOG_TYPE_STARTUP),
    (r"Uvicorn running on",             LOG_TYPE_STARTUP),
    (r"Started server process",         LOG_TYPE_STARTUP),
    (r"Waiting for application startup",LOG_TYPE_STARTUP),
    (r"Firebase Database:",             LOG_TYPE_STARTUP),
    (r"Auth Key Path:",                 LOG_TYPE_STARTUP),
    (r"LLM Backend shut down",          LOG_TYPE_SHUTDOWN),
    (r"Loading model",                   LOG_TYPE_MODEL),
    (r"Model .+ loaded",                LOG_TYPE_MODEL),
    (r"Model .+ already loaded",        LOG_TYPE_MODEL),
    (r"Unloading model",                LOG_TYPE_MODEL),
    (r"Downloading",                     LOG_TYPE_MODEL),
    (r"POST .*/api/chat",               LOG_TYPE_CHAT),
    (r"Unauthorized",                    LOG_TYPE_AUTH),
    (r"401",                             LOG_TYPE_AUTH),
    (r"GET .*/api/health",              LOG_TYPE_HEALTH),
    (r"GET .*/api/tags",                LOG_TYPE_HEALTH),
    (r"GET .*/api/ps",                  LOG_TYPE_HEALTH),
    (r"error|exception|traceback",      LOG_TYPE_ERROR),
]

_compiled_patterns = [(re.compile(pat, re.IGNORECASE), typ) for pat, typ in _PATTERNS]


def classify_log(message: str) -> str:
    """Return a log-type string for the given message."""
    for regex, log_type in _compiled_patterns:
        if regex.search(message):
            return log_type
    return LOG_TYPE_GENERAL


def _level_from_message(message: str) -> str:
    """Try to extract a log level from a raw message string."""
    upper = message.upper()
    if "ERROR" in upper or "EXCEPTION" in upper:
        return "ERROR"
    if "WARNING" in upper or "WARN" in upper:
        return "WARNING"
    return "INFO"


# ── Log entry dict factory ────────────────────────────────────────────

def make_entry(
    message: str,
    level: str = "INFO",
    source: str = "server",
    log_type: Optional[str] = None,
    extra: Optional[dict] = None,
) -> dict:
    """Create a log-entry dict."""
    now = datetime.now(timezone.utc)
    entry: dict = {
        "timestamp": now.isoformat(),
        "level": level.upper(),
        "message": message,
        "source": source,
        "type": log_type or classify_log(message),
    }
    if extra:
        entry["extra"] = extra
    return entry


# ── LogBuffer ─────────────────────────────────────────────────────────

class LogBuffer:
    """Thread-safe ring buffer that keeps the last *maxlen* log entries."""

    def __init__(self, maxlen: int = 500):
        self._buf: deque[dict] = deque(maxlen=maxlen)

    def push(self, entry: dict) -> None:
        self._buf.append(entry)

    def snapshot(self) -> list[dict]:
        """Return a copy of all buffered entries (oldest → newest)."""
        return list(self._buf)

    def __len__(self) -> int:
        return len(self._buf)


# ── SSEManager ────────────────────────────────────────────────────────

class SSEManager:
    """Manages async queues for connected SSE clients."""

    def __init__(self):
        self._clients: list[asyncio.Queue] = []

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._clients.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        try:
            self._clients.remove(q)
        except ValueError:
            pass

    async def broadcast(self, entry: dict) -> None:
        dead: list[asyncio.Queue] = []
        for q in self._clients:
            try:
                q.put_nowait(entry)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self._clients.remove(q)

    @property
    def client_count(self) -> int:
        return len(self._clients)


# ── FirebaseLogWriter ─────────────────────────────────────────────────

# Which log types are "meaningful" and worth persisting to Firebase
_PERSIST_TYPES = {
    LOG_TYPE_STARTUP,
    LOG_TYPE_SHUTDOWN,
    LOG_TYPE_MODEL,
    LOG_TYPE_CHAT,
    LOG_TYPE_AUTH,
    LOG_TYPE_ERROR,
}


class FirebaseLogWriter:
    """
    Pushes significant log entries to Firebase RTDB via REST.

    Path schema:  ServerLogs/<YYYY-MM-DD>/<safe-timestamp>/
    Only log types in _PERSIST_TYPES are written (health polls are skipped).
    """

    def __init__(self, database_url: str, auth_token: str = ""):
        self._base_url = database_url.rstrip("/")
        self._auth_token = auth_token
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def write(self, entry: dict) -> None:
        """Fire-and-forget write of a single log entry."""
        log_type = entry.get("type", LOG_TYPE_GENERAL)
        if log_type not in _PERSIST_TYPES:
            return  # skip health polls etc.

        try:
            ts = entry.get("timestamp", datetime.now(timezone.utc).isoformat())
            date_str = ts[:10]  # "YYYY-MM-DD"
            # Firebase keys cannot contain . # $ [ ] /
            safe_ts = ts.replace(".", "_").replace(":", "-").replace("+", "p")

            auth_q = f"?auth={self._auth_token}" if self._auth_token else ""
            url = (
                f"{self._base_url}/ServerLogs/{date_str}/{safe_ts}.json{auth_q}"
            )

            session = await self._get_session()
            async with session.put(
                url,
                json=entry,
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                if resp.status >= 400:
                    body = await resp.text()
                    # don't log to avoid recursion — just print
                    print(f"[FirebaseLogWriter] PUT {resp.status}: {body[:200]}")
        except Exception as exc:
            print(f"[FirebaseLogWriter] Error: {exc}")

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()


# ── Custom logging.Handler ────────────────────────────────────────────

class BufferAndBroadcastHandler(logging.Handler):
    """
    A stdlib logging handler that:
      1. Pushes every record into the LogBuffer
      2. Schedules an SSE broadcast to all connected clients
      3. Schedules a Firebase write for significant records
    """

    def __init__(
        self,
        log_buffer: LogBuffer,
        sse_manager: SSEManager,
        firebase_writer: Optional[FirebaseLogWriter] = None,
        level: int = logging.DEBUG,
    ):
        super().__init__(level)
        self.log_buffer = log_buffer
        self.sse_manager = sse_manager
        self.firebase_writer = firebase_writer

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
            entry = make_entry(
                message=msg,
                level=record.levelname,
                source=record.name,
            )

            self.log_buffer.push(entry)

            # Schedule broadcast + Firebase write on the running event loop
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(self.sse_manager.broadcast(entry))
                if self.firebase_writer:
                    loop.create_task(self.firebase_writer.write(entry))
            except RuntimeError:
                # No running event loop (e.g. during startup before uvicorn)
                pass
        except Exception:
            self.handleError(record)
