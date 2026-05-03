@echo off
REM ── Control Panel Eflow — One-Click Start ──────────────────────────
REM Starts both the Cloudflare Tunnel and the FastAPI LLM server.
REM ────────────────────────────────────────────────────────────────────

title ControlPanel Eflow Server

echo.
echo  ╔═══════════════════════════════════════════════╗
echo  ║   ControlPanel Eflow — Starting Services …   ║
echo  ╚═══════════════════════════════════════════════╝
echo.

REM Change to the directory where this script lives
cd /d "%~dp0"

REM ── 1. Start Cloudflare Tunnel in the background (Disabled for now) ──────
REM echo [1/2] Starting Cloudflare Tunnel …
REM start "Cloudflare Tunnel" /min cmd /c "cloudflared tunnel --config cloudflared.yml run"

REM Give the tunnel a moment to initialise
REM timeout /t 3 /nobreak >nul

REM ── 2. Activate venv and start FastAPI server ──────────────────────
echo [2/2] Starting FastAPI LLM server on 0.0.0.0:8321 …
echo.

if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
) else (
    echo WARNING: .venv not found — running with system Python
)

python main.py
