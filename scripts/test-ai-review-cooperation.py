#!/usr/bin/env python3
"""Offline tests for the CodeRabbit-required, provider-limit-aware cooperation report."""

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
HEAD_TIME = '2026-07-20T10:00:00Z'
AFTER = '2026-07-20T10:01:00Z'
LATER = '2026-07-20T10:02:00Z'
LATEST = '2026-07-20T10:03:00Z'
BEFORE = '2026-07-20T09:59:00Z'


def user(login: str, kind: str = 'Bot') -> dict[str, str]:
    return {'login': login, 'type': kind}


def comment(body: str, login: str = 'safal207', created_at: str = AFTER,
            association: str = 'OWNER', identifier: int | None = None,
            updated_at: str | None = None) -> dict[str, object]:
    item: dict[str, object] = {
        'body': body,
        'user': user(login, 'User' if login == 'safal207' else 'Bot'),
        'created_at': created_at,
        'updated_at': updated_at or created_at,
        'author_association': association,
    }
    if identifier is not None:
        item['id'] = identifier
    return item


def review(body: str, login: str = 'coderabbitai[bot]',
           commit_id: str = HEAD, submitted_at: str = LATER) -> dict[str, object]:
    return {
        'body': body,
        'user': user(login),
        'commit_id': commit_id,
        'submitted_at': submitted_at,
        'state': 'COMMENTED',
    }


def thread_comment(body: str, login: str = 'coderabbitai[bot]',
                   commit_id: str = HEAD, created_at: str = LATER,
                   path: str = 'example.py', line: int = 10) -> dict[str, object]:
    return {
        'body': body,
        'author': user(login),
        'createdAt': created_at,
        'commit': {'oid': commit_id},
        'path': path,
        'line': line,
    }


def threads(*comments: dict[str, object], resolved: bool = False,
            complete: bool = True) -> dict[str, object]:
    nodes = []
    if comments:
        nodes.append({
            'isResolved': resolved,
            'comments': {
                'pageInfo': {'hasNextPage': not complete, 'endCursor': None},
                'nodes': list(comments),
            },
        })
    return {'complete': complete, 'threads': nodes}


def check(name: str, *, identifier: int = 1, status: str = 'completed',
          conclusion: str | None = 'success') -> dict[str, object]:
    return {'id': identifier, 'name': name, 'status': status, 'conclusion': conclusion}


def base_inputs() -> dict[str, object]:
    return {
        'pr': {'head': {'sha': HEAD}},
        'head_commit': {'commit': {'committer': {'date': HEAD_TIME}}},
        'comments': [],
        'reviews': [],
        'review_comments': [],
        'threads_data': threads(),
        'checks': {'check_runs': [check('Security contract')]},
        'statuses': [],
        'files': [],
    }


def rabbit_request(created_at: str = AFTER, association: str = 'OWNER') -> dict[str, object]:
    return comment(f'@coderabbitai review\nExact head: {HEAD}', created_at=created_at,
                   association=association)


def rabbit_action_request(created_at: str = AFTER) -> dict[str, object]:
    return comment(
        f'<!-- coderabbit-reserve -->\n@coderabbitai review\n\nExact head: {HEAD}',
        login='github-actions[bot]', created_at=created_at, association='NONE')


def codex_request(created_at: str = AFTER) -> dict[str, object]:
    return comment(f'@codex review\nExact head: {HEAD}', created_at=created_at)


def deepseek_comment() -> dict[str, object]:
    return comment(
        f'<!-- deepseek-pr-review -->\n**Status:** complete\nReviewed commit: `{HEAD}`',
        login='github-actions[bot]', created_at=LATER, association='NONE')


class CooperationReportTests(unittest.TestCase):
    def report(self, **updates: object) -> str:
        data = base_inputs()
        data.update(updates)
        return MODULE.build_report(**data)

    def test_coderabbit_native_review_is_required_lane(self) -> None:
        report = self.report(comments=[rabbit_request()], reviews=[review('Clean review')])
        self.assertIn('| CodeRabbit | yes | E5 | clean exact-head review | no |', report)
        self.assertIn('| Codex | no | E0 | not requested | no |', report)
        self.assertIn('**READY_WITH_ADVISORY_GAPS**', report)

    def test_actions_marker_request_is_trusted(self) -> None:
        report = self.report(comments=[rabbit_action_request()], reviews=[review('Clean review')])
        self.assertIn('| CodeRabbit | yes | E5 | clean exact-head review | no |', report)

    def test_explicit_limit_signal_activates_waiver(self) -> None:
        report = self.report(comments=[
            rabbit_request(),
            comment('Review limit reached. Next review available in 2 hours.',
                    login='coderabbitai[bot]', created_at=LATER, association='NONE'),
        ])
        self.assertIn('| CodeRabbit | yes | E2 | provider limit waived | yes |', report)
        self.assertIn('`QUOTA_EXHAUSTED`', report)
        self.assertIn('**READY_WITH_ADVISORY_GAPS**', report)

    def test_limit_before_latest_request_does_not_waive(self) -> None:
        report = self.report(comments=[
            comment('Review limit reached.', login='coderabbitai[bot]', created_at=AFTER,
                    association='NONE'),
            rabbit_request(created_at=LATER),
        ])
        self.assertIn('| CodeRabbit | yes | E1 | missing evidence | no |', report)
        self.assertIn('**WAIT_FOR_EVIDENCE**', report)

    def test_negative_limit_phrase_does_not_waive(self) -> None:
        report = self.report(comments=[
            rabbit_request(),
            comment('No review limit was reached; review is starting.',
                    login='coderabbitai[bot]', created_at=LATER, association='NONE'),
        ])
        self.assertIn('| CodeRabbit | yes | E1 | missing evidence | no |', report)

    def test_untrusted_request_is_ignored(self) -> None:
        report = self.report(comments=[rabbit_request(association='NONE')],
                             reviews=[review('Clean review')])
        self.assertIn('| CodeRabbit | no | E0 | not requested | no |', report)
        self.assertIn('**WAIT_FOR_EVIDENCE**', report)

    def test_stale_review_does_not_count(self) -> None:
        report = self.report(comments=[rabbit_request()],
                             reviews=[review('Clean review', commit_id=OLD_HEAD)])
        self.assertIn('| CodeRabbit | yes | E1 | missing evidence | no |', report)

    def test_codex_advisory_review_cannot_satisfy_required_lane(self) -> None:
        report = self.report(
            comments=[codex_request()],
            reviews=[review('Clean Codex review', login='chatgpt-codex-connector[bot]')],
        )
        self.assertIn('| CodeRabbit | no | E0 | not requested | no |', report)
        self.assertIn('| Codex | yes | E5 | clean exact-head review | no |', report)
        self.assertIn('**WAIT_FOR_EVIDENCE**', report)

    def test_all_advisory_evidence_with_coderabbit_produces_ready(self) -> None:
        report = self.report(
            comments=[
                rabbit_request(), codex_request(), comment('@jules review'),
                comment('/deepseek review'), deepseek_comment(),
            ],
            reviews=[
                review('Clean Rabbit review'),
                review('Clean Codex review', login='chatgpt-codex-connector[bot]'),
                review('Clean Jules review', login='jules[bot]'),
            ],
        )
        self.assertIn('**Overall conclusion:** **READY**', report)

    def test_p2_finding_drives_fix_then_rerun(self) -> None:
        finding = thread_comment('P2 API contract mismatch')
        report = self.report(comments=[rabbit_request()], threads_data=threads(finding))
        self.assertIn('| CodeRabbit | yes | E4 | findings | no | P2x1 |', report)
        self.assertIn('**FIX_THEN_RERUN**', report)

    def test_decorated_major_label_is_p2(self) -> None:
        finding = thread_comment('_🎯 Functional Correctness_ | _🟠 Major_')
        report = self.report(comments=[rabbit_request()], threads_data=threads(finding))
        self.assertIn('P2x1', report)
        self.assertIn('**FIX_THEN_RERUN**', report)

    def test_dispositioned_issue_comment_becomes_clean(self) -> None:
        finding = comment(
            f'CodeRabbit Review: completed\n\nP2 API contract mismatch.\n\nReviewed commit: `{HEAD[:10]}`',
            login='coderabbitai[bot]', created_at=LATER, association='NONE', identifier=101)
        disposition = comment(
            f'Disposition-For-Issue-Comment: 101\nDisposition: rejected-with-evidence\nHead: {HEAD}',
            created_at=LATEST, identifier=102)
        report = self.report(comments=[rabbit_request(), finding, disposition])
        self.assertIn('| CodeRabbit | yes | E5 | clean exact-head review | no |', report)
        self.assertNotIn('P2x1', report)

    def test_edited_finding_invalidates_older_disposition(self) -> None:
        finding = comment(
            f'CodeRabbit Review: completed\n\nP2 API contract mismatch.\n\nReviewed commit: `{HEAD[:10]}`',
            login='coderabbitai[bot]', created_at=LATER,
            updated_at='2026-07-20T10:04:00Z', association='NONE', identifier=101)
        disposition = comment(
            f'Disposition-For-Issue-Comment: 101\nDisposition: accepted\nHead: {HEAD}',
            created_at=LATEST, identifier=102)
        report = self.report(comments=[rabbit_request(), finding, disposition])
        self.assertIn('P2x1', report)

    def test_required_ci_failure_blocks_even_with_limit_waiver(self) -> None:
        report = self.report(
            comments=[rabbit_request(), comment('Quota exceeded.', login='coderabbitai[bot]',
                                                created_at=LATER, association='NONE')],
            checks={'check_runs': [check('Security contract', conclusion='failure')]},
        )
        self.assertIn('**BLOCK**', report)

    def test_truncated_collection_forbids_ready(self) -> None:
        report = self.report(comments=[rabbit_request()], reviews=[review('Clean')],
                             threads_data=threads(complete=False))
        self.assertIn('**WAIT_FOR_EVIDENCE**', report)
        self.assertIn('EVIDENCE_TRUNCATED', report)

    def test_request_before_head_is_not_fresh(self) -> None:
        report = self.report(comments=[rabbit_request(created_at=BEFORE)],
                             reviews=[review('Clean')])
        self.assertIn('| CodeRabbit | no | E0 | not requested | no |', report)


if __name__ == '__main__':
    unittest.main(verbosity=2)
