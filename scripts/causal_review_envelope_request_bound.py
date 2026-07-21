#!/usr/bin/env python3
"""Run the causal envelope builder with request-bound cooperation evidence."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType


def load_module(name: str, path: Path) -> ModuleType:
    """Load one sibling Python module under a stable runtime name."""
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load module: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


DIRECTORY = Path(__file__).parent
COOPERATION = load_module(
    "robis_ai_review_cooperation_request_bound",
    DIRECTORY / "ai_review_cooperation_request_bound.py",
)
CAUSAL = load_module(
    "robis_causal_review_envelope_core",
    DIRECTORY / "causal_review_envelope.py",
)
CAUSAL.load_cooperation_module = lambda: COOPERATION


def main(argv: list[str]) -> int:
    """Delegate build and validation commands to the causal core."""
    return CAUSAL.main(argv)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
