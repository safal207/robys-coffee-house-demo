#!/usr/bin/env python3
"""Offline tests for the Codex-required, CodeRabbit-reserve cooperation report."""

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
LATER = '2026-06-30T00:02:00Z'
BEFORE = '2026-06-29T23:59:00Z'


def user(login: str, kind: str = 'Bot') -> dict[str, str]:
    return {'login': login, 'type': kind}


def comment(body: str, login: str = 'safal207', created_at: str = AFTER,
            association: str = 'OWNER') -> dict[str, object]:
    return {
        'body': body,
        'user': user(login, 'User' if login == 'safal207' else 'Bot'),
        'created_at': created_at,
        'updated_at': created_at,
        'author_association': association,
    }


def review(body: str, login: str = 'chatgpt-codex-connector[bot]',
           commit_id: str = HEAD, submitted_at: str = LATER) -> dict[str, object]:
    return {
        'body': body,
        'user': user(login),
        'commit_id': commit_id,
        'submitted_at': submitted_at,
        'state': 'COMMENTED',
    }


def thread_comment(body: str, login: str = 'chatgpt-codex-connector[bot]',
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
    return {
        'id': identifier,
        'name': name,
        'status': status,
        'conclusion': conclusion,
    }


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


def codex_request(created_at: str = AFTER, association: str = 'OWNER') -> dict[str, object]:
    return comment(f'@codex review\nExact head: {HEAD}', created_at=created_at,
                   association=association)


def rabbit_request(created_at: str = AFTER) -> dict[str, object]:
    return comment(
        f'<!-- coderabbit-reserve -->\n@coderabbitai review\n\nExact head: {HEAD}',
        login='github-actions[bot]', created_at=created_at, association='NONE')


def deepseek_comment() -> dict[str, object]:
    return comment(
        f'<!-- deepseek-pr-review -->\n**Status:** complete\nReviewed commit: `{HEAD}`',
        login='github-actions[bot]', created_at=LATER, association='NONE')


class CooperationReportTests(unittest.TestCase):
    def report(self, **updates: object) -> str:
        data = base_inputs()
        data.update(updates)
        return MODULE.build_report(**data)

    def test_codex_native_review_is_required_lane(self) -> None:
        report = self.report(comments=[codex_request()], reviews=[review('Clean review')])
        self.assertIn('| Codex | yes | E5 | clean exact-head review |', report)
        self.assertIn('| Qodo | no | E0 | disabled |', report)
        self.assertIn('| CodeRabbit | no | E0 | scheduled reserve |', report)
        self.assertIn('**READY_WITH_ADVISORY_GAPS**', report)

    def test_all_available_exact_head_evidence_produces_ready(self) -> None:
        report = self.report(
            comments=[
                codex_request(),
                comment('@jules review'),
                comment('/deepseek review'),
                deepseek_comment(),
            ],
            reviews=[
                review('Clean Codex review'),
                review('Clean Jules review', login='jules[bot]'),
            ],
        )
        self.assertIn('**Overall conclusion:** **READY**', report)
        self.assertIn('request-bound Codex exact-head evidence are complete', report)

    def test_canonical_codex_comment_with_short_commit_counts(self) -> None:
        report = self.report(
            comments=[
                codex_request(),
                comment(
                    f"Codex Review: Didn't find any major issues.\n\n**Reviewed commit:** `{HEAD[:10]}`",
                    login='chatgpt-codex-connector[bot]', created_at=LATER,
                    association='NONE'),
            ],
        )
        self.assertIn('| Codex | yes | E5 | clean exact-head review |', report)

    def test_canonical_codex_comment_without_backticks_counts(self) -> None:
        report = self.report(
            comments=[
                codex_request(),
                comment(
                    f"Codex Review: Didn't find any major issues.\n\n**Reviewed commit:** {HEAD[:10]}",
                    login='chatgpt-codex-connector[bot]', created_at=LATER,
                    association='NONE'),
            ],
        )
        self.assertIn('| Codex | yes | E5 | clean exact-head review |', report)

    def test_qodo_request_and_review_are_ignored(self) -> None:
        report = self.report(
            comments=[comment(f'/qodo review\nExact head: {HEAD}')],
            reviews=[review('P1 Qodo finding', login='qodo-code-review[bot]')],
        )
        self.assertIn('| Qodo | no | E0 | disabled |', report)
        self.assertIn('| Codex | no | E0 | not requested |', report)
        self.assertNotIn('P1x1', report)

    def test_coderabbit_reserve_is_not_required(self) -> None:
        report = self.report(
            comments=[rabbit_request()],
            reviews=[review('Clean Rabbit review', login='coderabbitai[bot]')],
        )
        self.assertIn('| CodeRabbit | yes | E5 | clean exact-head review |', report)
        self.assertIn('| Codex | no | E0 | not requested |', report)
        self.assertIn('**WAIT_FOR_EVIDENCE**', report)

    def test_unmarked_coderabbit_request_is_not_trusted_reserve(self) -> None:
        report = self.report(
            comments=[comment(f'@coderabbitai review\nExact head: {HEAD}')],
            reviews=[review('Clean Rabbit review', login='coderabbitai[bot]')],
        )
        self.assertIn('| CodeRabbit | no | E0 | scheduled reserve |', report)

    def test_verified_coderabbit_p2_enters_causal_graph(self) -> None:
        finding = thread_comment('P2 reserve reviewer found a race', login='coderabbitai[bot]')
        report = self.report(
            comments=[codex_request(), rabbit_request()],
            reviews=[review('Clean Codex review')],
            threads_data=threads(finding),
        )
        self.assertIn('| CodeRabbit | yes | E4 | findings | P2x1 |', report)
        self.assertIn('**FIX_THEN_RERUN**', report)

    def test_stale_codex_review_does_not_count(self) -> None:
        report = self.report(comments=[codex_request()],
                             reviews=[review('Clean', commit_id=OLD_HEAD)])
        self.assertIn('| Codex | yes | E1 | missing evidence |', report)
        self.assertIn('`NO_CURRENT_HEAD_EVIDENCE`', report)

    def test_spoofed_codex_login_does_not_count(self) -> None:
        report = self.report(
            comments=[codex_request()],
            reviews=[review('Clean', login='chatgpt-codex-connector-attacker[bot]')],
        )
        self.assertIn('| Codex | yes | E1 | missing evidence |', report)

    def test_untrusted_request_is_ignored(self) -> None:
        report = self.report(
            comments=[codex_request(association='NONE')],
            reviews=[review('Clean')],
        )
        self.assertIn('| Codex | no | E0 | not requested |', report)

    def test_request_before_head_is_not_fresh(self) -> None:
        report = self.report(
            comments=[codex_request(created_at=BEFORE)],
            reviews=[review('Clean')],
        )
        self.assertIn('| Codex | no | E0 | not requested |', report)

    def test_review_before_request_is_stale(self) -> None:
        report = self.report(
            comments=[codex_request()],
            reviews=[review('Clean', submitted_at=HEAD_TIME)],
        )
        self.assertIn('| Codex | yes | E1 | missing evidence |', report)

    def test_p2_finding_drives_fix_then_rerun(self) -> None:
        finding = thread_comment('P2 API contract mismatch')
        report = self.report(comments=[codex_request()],
                             threads_data=threads(finding))
        self.assertIn('| Codex | yes | E4 | findings | P2x1 |', report)
        self.assertIn('**FIX_THEN_RERUN**', report)

    def test_decorated_major_label_drives_fix_then_rerun(self) -> None:
        finding = thread_comment('_🎯 Functional Correctness_ | _🟠 Major_')
        report = self.report(comments=[codex_request()],
                             threads_data=threads(finding))
        self.assertIn('| Codex | yes | E4 | findings | P2x1 |', report)
        self.assertIn('**FIX_THEN_RERUN**', report)

    def test_resolved_thread_is_not_counted_as_finding(self) -> None:
        finding = thread_comment('P1 resolved issue')
        report = self.report(comments=[codex_request()],
                             reviews=[review('Clean')],
                             threads_data=threads(finding, resolved=True))
        self.assertNotIn('P1x1', report)
        self.assertIn('| Codex | yes | E5 | clean exact-head review |', report)

    def test_required_ci_failure_blocks(self) -> None:
        report = self.report(
            comments=[codex_request()], reviews=[review('Clean')],
            checks={'check_runs': [check('Security contract', conclusion='failure')]},
        )
        self.assertIn('**BLOCK**', report)
        self.assertIn('Security contract', report)

    def test_optional_ci_failure_does_not_block(self) -> None:
        report = self.report(
            comments=[codex_request()], reviews=[review('Clean')],
            checks={'check_runs': [
                check('Security contract'),
                check('Experimental optional check', conclusion='failure'),
            ]},
        )
        self.assertNotIn('**BLOCK**', report)
        self.assertIn('Experimental optional check', report)

    def test_latest_required_check_run_wins_by_name(self) -> None:
        report = self.report(
            comments=[codex_request()], reviews=[review('Clean')],
            checks={'check_runs': [
                check('Security contract', identifier=1, conclusion='failure'),
                check('Security contract', identifier=2, conclusion='success'),
            ]},
        )
        self.assertNotIn('**BLOCK**', report)

    def test_truncated_thread_collection_forbids_ready(self) -> None:
        report = self.report(comments=[codex_request()], reviews=[review('Clean')],
                             threads_data=threads(complete=False))
        self.assertIn('**WAIT_FOR_EVIDENCE**', report)
        self.assertIn('EVIDENCE_TRUNCATED', report)


if __name__ == '__main__':
    unittest.main(verbosity=2)
