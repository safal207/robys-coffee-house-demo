#!/usr/bin/env python3
"""Run DeepSeek inference with strict response-schema validation."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

REVIEWER = Path(__file__).with_name('deepseek-review.py')


class BufferedResponse:
    """Minimal urllib response wrapper for validated response bytes."""

    def __init__(self, payload: bytes) -> None:
        self._payload = payload

    def __enter__(self) -> 'BufferedResponse':
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return self._payload


def load_reviewer() -> ModuleType:
    spec = importlib.util.spec_from_file_location('deepseek_review_runtime', REVIEWER)
    if spec is None or spec.loader is None:
        raise RuntimeError(f'Cannot load {REVIEWER}')
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def validate_response(payload: bytes, reviewer: ModuleType) -> bytes:
    try:
        result: dict[str, Any] = json.loads(payload.decode('utf-8'))
        choice = result['choices'][0]
        finish_reason = choice['finish_reason']
    except (UnicodeDecodeError, json.JSONDecodeError, KeyError, IndexError, TypeError) as error:
        raise reviewer.ReviewError(
            'INVALID_RESPONSE',
            'DeepSeek API response is missing required finish_reason metadata',
        ) from error
    if not isinstance(finish_reason, str) or not finish_reason:
        raise reviewer.ReviewError(
            'INVALID_RESPONSE',
            'DeepSeek API response contains an invalid finish_reason',
        )
    return payload


def install_guard(reviewer: ModuleType) -> None:
    original = reviewer.urllib.request.urlopen

    def guarded_urlopen(*args: object, **kwargs: object) -> BufferedResponse:
        with original(*args, **kwargs) as response:
            payload = response.read()
        return BufferedResponse(validate_response(payload, reviewer))

    reviewer.urllib.request.urlopen = guarded_urlopen


def main() -> int:
    reviewer = load_reviewer()
    install_guard(reviewer)
    try:
        reviewer.infer()
    except reviewer.ReviewError as error:
        reviewer.record_error(error.code, str(error))
        print(f'DeepSeek reviewer error [{error.code}]: {error}', file=sys.stderr)
        return 1
    except Exception as error:
        reviewer.record_error('UNEXPECTED_ERROR', str(error))
        print(f'DeepSeek reviewer error [UNEXPECTED_ERROR]: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
