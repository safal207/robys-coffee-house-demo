#!/usr/bin/env python3
"""Offline tests for the causal AI reviewer cooperation report."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name('ai-review-cooperation.py')
SPEC = importlib.util.spec_from_file_location('ai_review_cooperation', SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f'Cannot load {SCRIPT}')
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)

HEAD = 'a' * 40
OLD_HEAD = 'b' * 40
HEAD_TIME = '2026-06-30T00:00:00Z'
AFTER = '2026-06-30T00:01:00Z'
BEFORE = '2026-06-29T23:59:00Z'


def user(login: str) -> dict[str, str]:
    return {'login': login}


def comment(
    body: str,
    login: str = 'safal207',
    created_at: str = AFTER,
    association: str = 'OWNER',
) -> dict[str, object]:
    return {
        'body': body,
        'user': user(login),
        'created_at': created_at,
        'author_association': association,
    }


def review(
    body: str,
    login: str,
    commit_id: str = HEAD,
    submitted_at: str = AFTER,
) -> dict[str, object]:
    return {
        'body': body,
        'user': user(login),
        'commit_id': commit_id,
        'submitted_at': submitted_at,
    }


def thread_comment(
    body: str,
    login: str,
    commit_id: str = HEAD,
    created_at: str = AFTER,
    path: str = 'example.py',
    line: int = 10,
) -> dict[str, object]:
    return {
        'body': body,
        'author': user(login),
        'createdAt': created_at,
        'commit': {'oid': commit_id},
        'path': path,
        'line': line,
    }


def threads(*comments: dict[str, object], resolved: bool = False) -> dict[str, object]:
    nodes = []
    if comments:
        nodes.append(
            {
                'isResolved': resolved,
                'comments': {'nodes': list(comments)},
            }
        )
    return {
        'data': {
            'repository': {
                'pullRequest': {'reviewThreads': {'nodes': nodes}}
            }
        }
    }


def base_inputs() -> dict[str, object]:
    return {
        'pr': {'head': {'sha': HEAD}},
        'head_commit': {'commit': {'committer': {'date': HEAD_TIME}}},
        'comments': [],
        'reviews': [],
        'review_comments': [],
        'threads_data': threads(),
        'checks': {'check_runs': []},
        'files': [],
    }


def check(
    name: str,
    *,
    identifier: int = 1,
    status: str = 'completed',
    conclusion: str | None = 'success',
) -> dict[str, object]:
    return {
        'id': identifier,
        'name': name,
        'status': status,
        'conclusion': conclusion,
    }


class CooperationReportTests(unittest.TestCase):
    def test_p2_finding_drives_fix_then_rerun(self) -> None:
        data = base_inputs()
        data['comments'] = [
            comment('@codex review'),
            comment('@jules review'),
            comment('@coderabbitai review'),
            comment('/deepseek review'),
            comment(
                'Review failed due to provider error.',
                login='coderabbitai[bot]',
                association='NONE',
            ),
        ]
        finding = thread_comment(
            'P2 Disable thinking for normal reviews.',
            login='chatgpt-codex-connector',
            path='scripts/deepseek-review.py',
            line=172,
        )
        data['threads_data'] = threads(finding)
        data['review_comments'] = [
            {
                'body': finding['body'],
                'user': user('chatgpt-codex-connector'),
                'commit_id': HEAD,
                'created_at': AFTER,
                'path': finding['path'],
                'line': finding['line'],
            }
        ]
        data['checks'] = {'check_runs': [check('Security contract')]}
        data['files'] = [{'filename': '.github/workflows/deepseek-review.yml'}]

        report = MODULE.build_report(**data)

        self.assertIn('**Overall conclusion:** **FIX_THEN_RERUN**', report)
        self.assertIn('| Codex | yes | E4 | findings | P2×1 |', report)
        self.assertIn('Unique root causes: **1**', report)
        self.assertIn('`NO_ACK`', report)
        self.assertIn('`PROVIDER_UNAVAILABLE`', report)
        self.assertIn('`BOOTSTRAP_NOT_ON_DEFAULT_BRANCH`', report)
        self.assertIn('flowchart TD', report)
        self.assertIn('Cause: ACTIONABLE_FINDINGS', report)

    def test_all_exact_head_evidence_produces_ready(self) -> None:
        data = base_inputs()
        data['comments'] = [
            comment('@codex review'),
            comment('@jules review'),
            comment('@coderabbitai review'),
            comment('/deepseek review'),
            comment(
                f'''<!-- deepseek-pr-review -->\nReviewed commit: `{HEAD}`\nСерьёзных проблем не найдено.''',
                login='github-actions[bot]',
                association='NONE',
            ),
        ]
        data['reviews'] = [
            review('No findings.', login='chatgpt-codex-connector'),
            review('No findings.', login='jules[bot]'),
            review('No findings.', login='coderabbitai[bot]'),
        ]
        data['checks'] = {
            'check_runs': [
                check('Security contract', identifier=10),
                check('Visual regression', identifier=11),
            ]
        }

        report = MODULE.build_report(**data)

        self.assertIn('**Overall conclusion:** **READY**', report)
        self.assertEqual(report.count('| E4 | reviewed | none | `OK` |'), 4)
        self.assertIn('CI: 2 passed, 0 pending, 0 failed', report)

    def test_required_ci_failure_blocks(self) -> None:
        data = base_inputs()
        data['comments'] = [comment('@codex review')]
        data['reviews'] = [review('No findings.', login='chatgpt-codex-connector')]
        data['checks'] = {
            'check_runs': [
                check('Security contract', conclusion='failure')
            ]
        }

        report = MODULE.build_report(**data)

        self.assertIn('**Overall conclusion:** **BLOCK**', report)
        self.assertIn('Failed checks: Security contract', report)

    def test_latest_check_run_wins_by_name(self) -> None:
        data = base_inputs()
        data['comments'] = [comment('@codex review')]
        data['reviews'] = [review('No findings.', login='chatgpt-codex-connector')]
        data['checks'] = {
            'check_runs': [
                check('Security contract', identifier=1, conclusion='failure'),
                check('Security contract', identifier=2, conclusion='success'),
            ]
        }

        report = MODULE.build_report(**data)

        self.assertNotIn('**Overall conclusion:** **BLOCK**', report)
        self.assertIn('Passed: **1**', report)
        self.assertIn('Failed: **0**', report)

    def test_stale_codex_review_does_not_count(self) -> None:
        data = base_inputs()
        data['comments'] = [comment('@codex review')]
        data['reviews'] = [
            review(
                'No findings.',
                login='chatgpt-codex-connector',
                commit_id=OLD_HEAD,
            )
        ]
        data['checks'] = {'check_runs': [check('Security contract')]}

        report = MODULE.build_report(**data)

        self.assertIn('**Overall conclusion:** **WAIT_FOR_EVIDENCE**', report)
        self.assertIn('`NO_CURRENT_HEAD_EVIDENCE`', report)

    def test_request_before_head_is_not_fresh(self) -> None:
        data = base_inputs()
        data['comments'] = [comment('@codex review', created_at=BEFORE)]
        data['checks'] = {'check_runs': [check('Security contract')]}

        report = MODULE.build_report(**data)

        self.assertIn('| Codex | no | E0 | not requested | none | `NO_REQUEST` |', report)
        self.assertIn(MODULE.COMMENT_MARKER, report)

    def test_untrusted_request_is_ignored(self) -> None:
        data = base_inputs()
        data['comments'] = [
            comment('@codex review', login='outsider', association='NONE')
        ]
        data['checks'] = {'check_runs': [check('Security contract')]}

        report = MODULE.build_report(**data)

        self.assertIn('| Codex | no | E0 | not requested | none | `NO_REQUEST` |', report)

    def test_resolved_thread_is_not_counted_as_finding(self) -> None:
        data = base_inputs()
        data['comments'] = [comment('@codex review')]
        data['reviews'] = [review('No findings.', login='chatgpt-codex-connector')]
        data['threads_data'] = threads(
            thread_comment('P1 old issue', login='chatgpt-codex-connector'),
            resolved=True,
        )
        data['checks'] = {'check_runs': [check('Security contract')]}

        report = MODULE.build_report(**data)

        self.assertNotIn('P1×1', report)
        self.assertIn('**Overall conclusion:** **READY_WITH_ADVISORY_GAPS**', report)


if __name__ == '__main__':
    unittest.main()
