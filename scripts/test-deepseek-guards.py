#!/usr/bin/env python3
"""Offline tests for DeepSeek transport and secret-isolation guards."""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).parent


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f'Cannot load {path}')
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


REVIEWER = load('deepseek_review_guard_test', ROOT / 'deepseek-review.py')
GUARD = load('deepseek_infer_strict_test', ROOT / 'deepseek-infer-strict.py')


class FakeResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = json.dumps(payload, ensure_ascii=False).encode('utf-8')

    def __enter__(self) -> 'FakeResponse':
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return self.payload


class DeepSeekGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.saved_env = os.environ.copy()
        self.tempdir = tempfile.TemporaryDirectory()
        root = Path(self.tempdir.name)
        REVIEWER.PROMPT_PATH = root / 'prompt.txt'
        REVIEWER.PROMPT_PATH.write_text('Review the diff.', encoding='utf-8')
        self.response = root / 'response.txt'
        self.error = root / 'error.json'
        sentinel = '-'.join(('unit', 'sentinel', 'value'))
        os.environ.update(
            {
                'DEEPSEEK_API_KEY': sentinel,
                'MODEL': 'deepseek-v4-flash',
                'MODE': 'review',
                'RESPONSE_FILE': str(self.response),
                'ERROR_FILE': str(self.error),
            }
        )
        self.sentinel = sentinel

    def tearDown(self) -> None:
        os.environ.clear()
        os.environ.update(self.saved_env)
        self.tempdir.cleanup()

    def test_missing_finish_reason_is_invalid(self) -> None:
        payload = json.dumps(
            {'choices': [{'message': {'content': 'partial'}}]}
        ).encode('utf-8')
        with self.assertRaisesRegex(REVIEWER.ReviewError, 'finish_reason') as raised:
            GUARD.validate_response(payload, REVIEWER)
        self.assertEqual(raised.exception.code, 'INVALID_RESPONSE')

    def test_secret_is_header_only_not_request_body(self) -> None:
        captured: dict[str, object] = {}

        def fake_urlopen(request: object, timeout: int) -> FakeResponse:
            captured['request'] = request
            return FakeResponse(
                {
                    'choices': [
                        {
                            'finish_reason': 'stop',
                            'message': {'content': 'Серьёзных проблем не найдено.'},
                        }
                    ]
                }
            )

        with mock.patch.object(REVIEWER.urllib.request, 'urlopen', side_effect=fake_urlopen):
            REVIEWER.infer()

        request = captured['request']
        raw_body = request.data.decode('utf-8')
        self.assertNotIn(self.sentinel, raw_body)
        self.assertEqual(request.get_header('Authorization'), f'Bearer {self.sentinel}')


if __name__ == '__main__':
    unittest.main()
