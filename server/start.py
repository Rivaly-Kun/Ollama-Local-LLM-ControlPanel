#!/usr/bin/env python3
"""
Start script for the Local LLM Backend.

Usage:
    python server/start.py          # first run: creates venv, installs deps, starts
    python server/start.py --skip-setup   # skip venv setup, just start

This script:
1. Creates a Python virtual environment (server/.venv) if it doesn't exist
2. Installs requirements.txt into the venv
3. Launches the FastAPI server on port 8321
"""

import os
import sys
import subprocess
import platform
from pathlib import Path

# Fix Windows console encoding
if sys.platform == "win32":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

SERVER_DIR = Path(__file__).parent.resolve()
VENV_DIR = SERVER_DIR / ".venv"
REQUIREMENTS = SERVER_DIR / "requirements.txt"

IS_WINDOWS = platform.system() == "Windows"
PYTHON_BIN = VENV_DIR / ("Scripts" if IS_WINDOWS else "bin") / ("python.exe" if IS_WINDOWS else "python")
PIP_BIN = VENV_DIR / ("Scripts" if IS_WINDOWS else "bin") / ("pip.exe" if IS_WINDOWS else "pip")


def find_python() -> str:
    """Find a working Python 3.10+ interpreter."""
    for cmd in ["python", "python3", "py -3"]:
        try:
            result = subprocess.run(
                cmd.split(), capture_output=True, text=True,
                timeout=5,
            )
            if result.returncode == 0 or "Python 3" in (result.stdout + result.stderr):
                # Verify version
                ver_result = subprocess.run(
                    [*cmd.split(), "--version"],
                    capture_output=True, text=True, timeout=5,
                )
                version_str = ver_result.stdout.strip() + ver_result.stderr.strip()
                if "3.1" in version_str or "3.9" in version_str:
                    return cmd
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
    return "python"


def setup_venv():
    """Create virtual environment and install dependencies."""
    if PYTHON_BIN.exists():
        print(f"  [OK] Virtual environment exists at {VENV_DIR}")
    else:
        print(f"  -> Creating virtual environment at {VENV_DIR} ...")
        python_cmd = find_python()
        subprocess.run(
            [*python_cmd.split(), "-m", "venv", str(VENV_DIR)],
            check=True,
        )
        print("  [OK] Virtual environment created")

    # Check if deps already installed (skip slow pip checks)
    marker = VENV_DIR / ".deps_installed"
    if marker.exists():
        print("  [OK] Dependencies already installed (delete server/.venv/.deps_installed to force reinstall)")
        return

    # Install / upgrade dependencies
    print("  -> Installing dependencies ...")

    # Upgrade pip (non-fatal -- old pip still works fine)
    subprocess.run(
        [str(PYTHON_BIN), "-m", "pip", "install", "--upgrade", "pip"],
        capture_output=True,
    )

    # Install llama-cpp-python from prebuilt wheels (avoids C++ compilation)
    print("  -> Installing llama-cpp-python (prebuilt wheel) ...")
    result = subprocess.run(
        [
            str(PYTHON_BIN), "-m", "pip", "install",
            "llama-cpp-python>=0.3.0",
            "--extra-index-url", "https://abetlen.github.io/llama-cpp-python/whl/cpu",
            "--prefer-binary",
        ],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        # Fallback: try normal install (will compile from source)
        print("  [WARN] Prebuilt wheel not found, compiling from source (this may take a few minutes) ...")
        subprocess.run(
            [str(PYTHON_BIN), "-m", "pip", "install", "llama-cpp-python>=0.3.0"],
            check=True,
        )

    # Install remaining dependencies
    subprocess.run(
        [str(PYTHON_BIN), "-m", "pip", "install", "-r", str(REQUIREMENTS)],
        check=True,
    )

    # Write marker so we skip this next time
    marker.write_text("installed")
    print("  [OK] Dependencies installed")


def start_server():
    """Launch the FastAPI server."""
    print(f"\n[START] Starting LLM Backend on http://127.0.0.1:8321")
    print(f"        Models directory: {SERVER_DIR.parent / 'models'}\n")

    main_py = SERVER_DIR / "main.py"
    sys.exit(
        subprocess.call(
            [str(PYTHON_BIN), str(main_py)],
            cwd=str(SERVER_DIR),
        )
    )


def main():
    print("\n========================================")
    print("    Local LLM Backend — Setup & Run")
    print("========================================\n")

    skip_setup = "--skip-setup" in sys.argv

    if not skip_setup:
        setup_venv()

    start_server()


if __name__ == "__main__":
    main()
