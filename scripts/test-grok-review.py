#!/usr/bin/env python3
"""Offline regression tests for the advisory Grok reviewer."""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from uuid import uuid4

SCRIPT = Path(__file__).with_name('grok-review.py')
HEAD = 'a' * 40


class GrokReviewTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix='test-grok-review-')
        self.root = Path(self.temp.name)
        self.paths = {
            'PR_JSON_FILE': self.root / 'pr.json',
            'DIFF_FILE': self.root / 'pr.diff',
            'CURRENT_PR_JSON_FILE': self.root / 'current-pr.json',
            'PROMPT_FILE': self.root / 'prompt.txt',
            'RESPONSE_FILE': self.root / 'response.txt',
            'COMMENT_FILE': self.root / 'comment.json',
            'ERROR_FILE': self.root / 'error.json',
            'GITHUB_OUTPUT': self.root / 'github-output.txt',
        }
        for name, path in self.paths.items():
            os.environ[name] = str(path)
        os.environ.update({
            'REPOSITORY': 'owner/repo',
            'PR_NUMBER': '208',
            'COMMAND': '/grok review',
            'GROK_MODEL': 'grok-4.5',
            'MODEL': 'grok-4.5',
            'MODE': 'review',
            'TRUNCATED': 'false',
            'HEAD_SHA': HEAD,
            'RUN_URL': 'https://github.example/actions/runs/1',
        })
        module_name = f'grok_review_test_{uuid4().hex}'
        spec = importlib.util.spec_from_file_location(module_name, SCRIPT)
        if spec is None or spec.loader is None:
            raise RuntimeError(f'Cannot load {SCRIPT}')
        self.module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = self.module
        spec.loader.exec_module(self.module)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def write_pr(self, *, state: str = 'open') -> None:
        payload = {
            'state': state,
            'title': 'governance test',
            'changed_files': 12,
            'additions': 100,
            'deletions': 50,
            'base': {'ref': 'main'},
            'head': {'ref': 'feature', 'sha': HEAD},
        }
        self.paths['PR_JSON_FILE'].write_text(json.dumps(payload), encoding='utf-8')
        self.paths['CURRENT_PR_JSON_FILE'].write_text(json.dumps(payload), encoding='utf-8')

    def test_prepare_replaces_invalid_utf8_and_truncates_large_diff(self) -> None:
        self.write_pr()
        self.paths['DIFF_FILE'].write_bytes(b'\xff' + b'A' * 23_000)

        self.module.prepare()

        prompt = self.paths['PROMPT_FILE'].read_text(encoding='utf-8')
        outputs = self.paths['GITHUB_OUTPUT'].read_text(encoding='utf-8')
        self.assertIn('\ufffd', prompt)
        self.assertIn('[... DIFF TRUNCATED BY WORKFLOW ...]', prompt)
        self.assertIn(f'head_sha={HEAD}', outputs)
        self.assertIn('truncated=true', outputs)

    def test_publish_uses_hidden_machine_binding_and_trilingual_label(self) -> None:
        self.write_pr()
        self.paths['RESPONSE_FILE'].write_text(
            'English: No actionable issues found.\n'
            'Türkçe: Eyleme geçirilebilir sorun bulunamadı.\n'
            'Русский: Существенных проблем не найдено.',
            encoding='utf-8',
        )

        self.module.publish()

        body = json.loads(self.paths['COMMENT_FILE'].read_text(encoding='utf-8'))['body']
        self.assertIn(f'<!-- Reviewed commit: `{HEAD}` -->', body)
        self.assertNotIn(f'\nReviewed commit: `{HEAD}`', body)
        self.assertIn('Reviewed commit / İncelenen commit / Проверенный commit', body)
        self.assertIn('<!-- grok-pr-review -->', body)

    def test_failure_uses_the_same_hidden_binding(self) -> None:
        self.paths['ERROR_FILE'].write_text(
            json.dumps({'code': 'RATE_LIMITED', 'detail': 'retry later'}),
            encoding='utf-8',
        )

        self.module.failure()

        body = json.loads(self.paths['COMMENT_FILE'].read_text(encoding='utf-8'))['body']
        self.assertIn(f'<!-- Reviewed commit: `{HEAD}` -->', body)
        self.assertNotIn(f'\nReviewed commit: `{HEAD}`', body)
        self.assertIn('`RATE_LIMITED`', body)

    def test_publish_rejects_closed_pull_request(self) -> None:
        self.write_pr(state='closed')
        self.paths['RESPONSE_FILE'].write_text('English: clean', encoding='utf-8')

        with self.assertRaises(self.module.ReviewError) as raised:
            self.module.publish()

        self.assertEqual(raised.exception.code, 'PR_NOT_OPEN')


if __name__ == '__main__':
    unittest.main()
