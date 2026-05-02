"""
Model Registry — defines available models and handles GGUF downloads from HuggingFace.

Each model entry maps a local tag (used by the frontend) to a HuggingFace repo
and filename.  Models are downloaded lazily on first use.
"""

import os
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from huggingface_hub import hf_hub_download

logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).parent.parent / "models"


@dataclass
class ModelEntry:
    """A single model definition."""
    tag: str                  # e.g. "llama3:8b" — matches the frontend
    display_name: str
    hf_repo: str              # HuggingFace repo id
    hf_filename: str          # The .gguf file inside the repo
    chat_format: str          # llama-cpp-python chat_format string
    n_ctx: int = 4096         # default context window
    description: str = ""
    family: str = ""
    parameter_size: str = ""
    quantization: str = "Q4_K_M"
    size_bytes: int = 0       # approximate file size
    supports_vision: bool = False
    extra_kwargs: dict = field(default_factory=dict)

    @property
    def local_path(self) -> Path:
        """Path where the GGUF file is stored locally."""
        safe_name = self.tag.replace(":", "_").replace("/", "_")
        return MODELS_DIR / f"{safe_name}.gguf"

    @property
    def is_downloaded(self) -> bool:
        return self.local_path.exists()


# ── Model definitions ─────────────────────────────────────────────────

MODELS: list[ModelEntry] = [
    ModelEntry(
        tag="llama3:8b",
        display_name="Llama 3 8B",
        hf_repo="bartowski/Meta-Llama-3-8B-Instruct-GGUF",
        hf_filename="Meta-Llama-3-8B-Instruct-Q4_K_M.gguf",
        chat_format="llama-3",
        n_ctx=8192,
        description="Chat / Edit",
        family="llama",
        parameter_size="8B",
        quantization="Q4_K_M",
        size_bytes=4_920_000_000,
    ),
    ModelEntry(
        tag="qwen2.5:7b",
        display_name="Qwen 2.5 7B",
        hf_repo="bartowski/Qwen2.5-7B-Instruct-GGUF",
        hf_filename="Qwen2.5-7B-Instruct-Q4_K_M.gguf",
        chat_format="chatml",
        n_ctx=8192,
        description="Balanced chat",
        family="qwen2",
        parameter_size="7B",
        quantization="Q4_K_M",
        size_bytes=4_680_000_000,
    ),
    ModelEntry(
        tag="deepseek-r1:8b",
        display_name="DeepSeek R1 8B",
        hf_repo="bartowski/DeepSeek-R1-Distill-Llama-8B-GGUF",
        hf_filename="DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf",
        chat_format="llama-3",
        n_ctx=8192,
        description="Advanced reasoning",
        family="deepseek",
        parameter_size="8B",
        quantization="Q4_K_M",
        size_bytes=4_940_000_000,
    ),
    ModelEntry(
        tag="phi3:latest",
        display_name="Phi-3 Mini",
        hf_repo="bartowski/Phi-3.1-mini-4k-instruct-GGUF",
        hf_filename="Phi-3.1-mini-4k-instruct-Q4_K_M.gguf",
        chat_format="chatml",
        n_ctx=4096,
        description="Fast responses",
        family="phi3",
        parameter_size="3.8B",
        quantization="Q4_K_M",
        size_bytes=2_390_000_000,
    ),
    ModelEntry(
        tag="qwen2.5-coder:1.5b",
        display_name="Qwen2.5-Coder 1.5B",
        hf_repo="Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF",
        hf_filename="qwen2.5-coder-1.5b-instruct-q4_k_m.gguf",
        chat_format="chatml",
        n_ctx=4096,
        description="Autocomplete / Code",
        family="qwen2",
        parameter_size="1.5B",
        quantization="Q4_K_M",
        size_bytes=1_100_000_000,
    ),
    ModelEntry(
        tag="gemma3:12b",
        display_name="Gemma 3 12B",
        hf_repo="bartowski/google_gemma-3-12b-it-GGUF",
        hf_filename="google_gemma-3-12b-it-Q4_K_M.gguf",
        chat_format="gemma",
        n_ctx=8192,
        description="Strong reasoning",
        family="gemma",
        parameter_size="12B",
        quantization="Q4_K_M",
        size_bytes=7_330_000_000,
        supports_vision=False,  # vision needs multimodal projector, text-only for now
    ),
    ModelEntry(
        tag="nomic-embed-text:latest",
        display_name="Nomic Embed Text",
        hf_repo="nomic-ai/nomic-embed-text-v1.5-GGUF",
        hf_filename="nomic-embed-text-v1.5.Q4_K_M.gguf",
        chat_format="",  # embedding model, not used for chat
        n_ctx=2048,
        description="Text embeddings",
        family="nomic",
        parameter_size="137M",
        quantization="Q4_K_M",
        size_bytes=86_000_000,
    ),
]

# Quick lookup by tag
_MODEL_MAP: dict[str, ModelEntry] = {m.tag: m for m in MODELS}


def get_model(tag: str) -> Optional[ModelEntry]:
    """Look up a model by its tag."""
    return _MODEL_MAP.get(tag)


def list_all_models() -> list[ModelEntry]:
    """Return all registered models."""
    return list(MODELS)


def download_model(entry: ModelEntry, force: bool = False) -> Path:
    """
    Download a model's GGUF file from HuggingFace if not already present.
    Returns the local file path.
    """
    if entry.is_downloaded and not force:
        logger.info(f"Model {entry.tag} already downloaded at {entry.local_path}")
        return entry.local_path

    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    logger.info(f"Downloading {entry.display_name} from {entry.hf_repo}/{entry.hf_filename} ...")

    downloaded_path = hf_hub_download(
        repo_id=entry.hf_repo,
        filename=entry.hf_filename,
        local_dir=str(MODELS_DIR),
        local_dir_use_symlinks=False,
    )

    # Rename to our standard name if needed
    dl = Path(downloaded_path)
    if dl != entry.local_path:
        if entry.local_path.exists():
            entry.local_path.unlink()
        dl.rename(entry.local_path)

    logger.info(f"Downloaded {entry.display_name} → {entry.local_path}")
    return entry.local_path
