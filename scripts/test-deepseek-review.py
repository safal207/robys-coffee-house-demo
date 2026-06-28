#!/usr/bin/env python3
"""Offline contract tests for the DeepSeek PR reviewer helper."""

from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).with_name('deepseek-review.py')
SPEC = importlib.util.spec_from_file_location('deepseek_review', SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f'Cannot load {SCRIPT}')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class DeepSeekReviewTests(unittest.TestCase):
    def setUp(self) -> None:
        self.saved_env = os.environ.copy()
        self.tempdir = tempfile.TemporaryDirectory()
        root = Path(self.tempdir.name)
        self.output = root / 'outputs.txt'
        self.prompt = root / 'prompt.txt'
        MODULE.PROMPT_PATH = self.prompt
        os.environ.update(
            {
                'API_URL': 'https://api.github.test',
                'GH_TOKEN': 'test-token',
                'REPOSITORY': 'owner/repo',
                'PR_NUMBER': '17',
                'GITHUB_OUTPUT': str(self.output),
            }
        )

    def tearDown(self) -> None:
        os.environ.clear()
        os.environ.update(self.saved_env)
        self.tempdir.cleanup()

    @staticmethod
    def fake_api(path: str, *, accept: str = 'application/vnd.github+json', payload=None) -> bytes:
        if payload is not None:
            raise AssertionError('prepare must not post')
        if accept == 'application/vnd.github.v3.diff':
            return b'diff --git a/a.js b/a.js\n+const safe = true;\n'
        return json.dumps(
            {
                'title': 'Test PR',
                'head': {'sha': 'abc123', 'ref': 'feature'},
                'base': {'ref': 'main'},
                'changed_files': 1,
                'additions': 1,
                'deletions': 0,
            }
        ).encode()

    def outputs(self) -> dict[str, str]:
        return dict(
            line.split('=', 1)
            for line in self.output.read_text(encoding='utf-8').splitlines()
        )

    def test_prepare_v3_records_current_head_and_prompt(self) -> None:
        os.environ['COMMAND'] = '/deepseek review'
        with patch.object(MODULE, 'api_request', side_effect=self.fake_api):
            MODULE.prepare()

        outputs = self.outputs()
        self.assertEqual(outputs['model'], 'deepseek/deepseek-v3-0324')
        self.assertEqual(outputs['head_sha'], 'abc123')
        self.assertEqual(outputs['truncated'], 'false')
        prompt = self.prompt.read_text(encoding='utf-8')
        self.assertIn('Reviewed commit: abc123', prompt)
        self.assertIn('+const safe = true;', prompt)
        self.assertNotIn('__PR_DIFF__', prompt)

    def test_prepare_r1_selects_deep_review_mode(self) -> None:
        os.environ['COMMAND'] = '/deepseek deep-review'
        with patch.object(MODULE, 'api_request', side_effect=self.fake_api):
            MODULE.prepare()

        outputs = self.outputs()
        self.assertEqual(outputs['model'], 'deepseek/deepseek-r1-0528')
        self.assertEqual(outputs['mode'], 'deep-review')

    def test_publish_embeds_response_and_evidence(self) -> None:
        response = Path(self.tempdir.name) / 'response.txt'
        response.write_text('Серьёзных проблем не найдено.', encoding='utf-8')
        os.environ.update(
            {
                'RESPONSE_FILE': str(response),
                'MODEL': 'deepseek/deepseek-v3-0324',
                'HEAD_SHA': 'abc123',
                'MODE': 'review',
                'TRUNCATED': 'false',
            }
        )
        comments: list[str] = []
        with patch.object(MODULE, 'post_comment', side_effect=comments.append):
            MODULE.publish()

        self.assertEqual(len(comments), 1)
        self.assertIn('**Reviewed commit:** `abc123`', comments[0])
        self.assertIn('Серьёзных проблем не найдено.', comments[0])
        self.assertNotIn('__MODEL_RESPONSE__', comments[0])


if __name__ == '__main__':
    unittest.main()
