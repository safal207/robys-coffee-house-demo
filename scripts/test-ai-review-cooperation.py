#!/usr/bin/env python3
'''Offline tests for the causal AI reviewer cooperation report.'''

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
ANCHOR = '2026-06-30T00:00:00Z'
AFTER = '2026-06-30T00:02:00Z'
BETWEEN = '2026-06-30T00:01:00Z'
BEFORE = '2026-06-29T23:59:00Z'
BOT_LOGINS = {
    'qodo-code-review', 'qodo-code-review[bot]',
    'chatgpt-codex-connector', 'chatgpt-codex-connector[bot]',
    'jules', 'jules[bot]', 'google-labs-jules[bot]',
    'coderabbitai', 'coderabbitai[bot]', 'github-actions[bot]',
}


def user(login: str) -> dict[str, str]:
    return {'login': login, 'type': 'Bot' if login in BOT_LOGINS else 'User'}


def comment(
    body: str, login: str = 'safal207', created_at: str = BETWEEN,
    association: str = 'OWNER',
) -> dict[str, object]:
    return {
        'body': body, 'user': user(login), 'created_at': created_at,
        'author_association': association,
    }


def review(
    body: str, login: str, commit_id: str = HEAD, submitted_at: str = AFTER,
    state: str = 'COMMENTED',
) -> dict[str, object]:
    return {
        'body': body, 'user': user(login), 'commit_id': commit_id,
        'submitted_at': submitted_at, 'state': state,
    }


def thread_comment(
    body: str, login: str, commit_id: str = HEAD, created_at: str = AFTER,
    path: str = 'example.py', line: int = 10,
) -> dict[str, object]:
    return {
        'body': body, 'author': user(login), 'createdAt': created_at,
        'commit': {'oid': commit_id}, 'path': path, 'line': line,
    }


def threads(*comments: dict[str, object], resolved: bool = False, complete: bool = True) -> dict[str, object]:
    nodes = []
    if comments:
        nodes.append({
            'isResolved': resolved,
            'comments': {
                'pageInfo': {'hasNextPage': False, 'endCursor': None},
                'nodes': list(comments),
            },
        })
    return {'complete': complete, 'threads': nodes}


def check(
    name: str, *, identifier: int = 1, status: str = 'completed',
    conclusion: str | None = 'success', started_at: str | None = None,
) -> dict[str, object]:
    result: dict[str, object] = {
        'id': identifier, 'name': name, 'status': status, 'conclusion': conclusion,
    }
    if started_at:
        result['started_at'] = started_at
    return result


def base_inputs() -> dict[str, object]:
    return {
        'pr': {'head': {'sha': HEAD}},
        # Intentionally backdated: freshness must come from the server-side check anchor.
        'head_commit': {'commit': {'committer': {'date': BEFORE}}},
        'comments': [], 'reviews': [], 'review_comments': [],
        'threads_data': threads(),
        'checks': {
            'head_update_anchor': ANCHOR,
            'check_runs': [],
        },
        'statuses': [], 'files': [],
    }


def exact_action_comment(marker: str, created_at: str = AFTER) -> dict[str, object]:
    if marker == '<!-- grok-pr-review -->':
        body = f'''{marker}
<!-- Reviewed commit: `{HEAD}` -->
### Grok PR Review / Grok PR İncelemesi / Проверка PR от Grok

**Reviewed commit / İncelenen commit / Проверенный commit:** `{HEAD}`  

English: No actionable issues found.
Türkçe: Eyleme geçirilebilir sorun bulunamadı.
Русский: Существенных проблем не найдено.'''
    else:
        body = f'{marker}\nReviewed commit: `{HEAD}`\nNo actionable findings.'
    return comment(
        body, login='github-actions[bot]', created_at=created_at, association='NONE',
    )


class CooperationReportTests(unittest.TestCase):
    def test_all_exact_head_evidence_produces_ready(self) -> None:
        data = base_inputs()
        data['comments'] = [
            comment('/qodo review'), comment('@codex review'), comment('@jules review'),
            comment('@coderabbitai review'), comment('/deepseek review'),
            comment('/grok review'), exact_action_comment('<!-- deepseek-pr-review -->'),
            exact_action_comment('<!-- grok-pr-review -->'),
        ]
        data['reviews'] = [
            review('No findings.', 'qodo-code-review'),
            review('No findings.', 'chatgpt-codex-connector'),
            review('No findings.', 'jules[bot]'),
            review('No findings.', 'coderabbitai[bot]'),
        ]
        data['checks']['check_runs'] = [check('Security contract')]
        report_text = MODULE.build_report(**data)
        self.assertIn('**Overall conclusion:** **READY**', report_text)
        self.assertEqual(report_text.count('| E5 | clean exact-head review | none | `OK` |'), 6)
        self.assertIn('| Grok | yes | E5 | clean exact-head review |', report_text)

    def test_backdated_commit_does_not_admit_pre_anchor_request(self) -> None:
        data = base_inputs()
        data['comments'] = [comment('/qodo review', created_at=BEFORE)]
        data['reviews'] = [review('No findings.', 'qodo-code-review')]
        report_text = MODULE.build_report(**data)
        self.assertIn('| Qodo | no | E0 | not requested |', report_text)
        self.assertIn('WAIT_FOR_EVIDENCE', report_text)

    def test_qodo_review_before_request_does_not_count(self) -> None:
        data = base_inputs()
        data['comments'] = [comment('/qodo review', created_at=AFTER)]
        data['reviews'] = [review('No findings.', 'qodo-code-review', submitted_at=BETWEEN)]
        report_text = MODULE.build_report(**data)
        self.assertIn('| Qodo | yes | E1 | missing evidence |', report_text)

    def test_qodo_review_after_request_counts(self) -> None:
        data = base_inputs()
        data['comments'] = [comment('/qodo review', created_at=BETWEEN)]
        data['reviews'] = [review('No findings.', 'qodo-code-review', submitted_at=AFTER)]
        data['checks']['check_runs'] = [check('Security contract')]
        report_text = MODULE.build_report(**data)
        self.assertIn('| Qodo | yes | E5 | clean exact-head review |', report_text)
        self.assertIn('READY_WITH_ADVISORY_GAPS', report_text)

    def test_pending_and_dismissed_qodo_reviews_do_not_count(self) -> None:
        for state in ('PENDING', 'DISMISSED'):
            with self.subTest(state=state):
                data = base_inputs()
                data['comments'] = [comment('/qodo review')]
                data['reviews'] = [review('No findings.', 'qodo-code-review', state=state)]
                report_text = MODULE.build_report(**data)
                self.assertIn('| Qodo | yes | E1 | missing evidence |', report_text)

    def test_grok_evidence_must_follow_request(self) -> None:
        data = base_inputs()
        data['comments'] = [
            comment('/qodo review'), review('No findings.', 'qodo-code-review'),
            exact_action_comment('<!-- grok-pr-review -->', created_at=BETWEEN),
            comment('/grok review', created_at=AFTER),
        ]
        data['reviews'] = [review('No findings.', 'qodo-code-review')]
        report_text = MODULE.build_report(**data)
        self.assertIn('| Grok | yes | E1 | missing evidence |', report_text)

    def test_grok_multilingual_label_without_canonical_binding_does_not_count(self) -> None:
        data = base_inputs()
        multilingual_only = comment(
            f'''<!-- grok-pr-review -->
### Grok PR Review / Grok PR İncelemesi / Проверка PR от Grok
**Reviewed commit / İncelenen commit / Проверенный commit:** `{HEAD}`''',
            login='github-actions[bot]', created_at=AFTER, association='NONE',
        )
        data['comments'] = [comment('/grok review'), multilingual_only]
        report_text = MODULE.build_report(**data)
        self.assertIn('| Grok | yes | E1 | missing evidence |', report_text)

    def test_spoofed_grok_marker_does_not_count(self) -> None:
        data = base_inputs()
        data['comments'] = [
            comment('/grok review'),
            comment(f'<!-- grok-pr-review -->\nReviewed commit: `{HEAD}`', login='attacker', association='NONE'),
        ]
        report_text = MODULE.build_report(**data)
        self.assertIn('| Grok | yes | E1 |', report_text)

    def test_bootstrap_grok_is_reported_as_advisory_pending(self) -> None:
        data = base_inputs()
        data['comments'] = [comment('/grok review')]
        data['files'] = [{'filename': '.github/workflows/grok-review.yml'}]
        report_text = MODULE.build_report(**data)
        self.assertIn('| Grok | yes | E1 | bootstrap pending |', report_text)
        self.assertIn('`BOOTSTRAP_NOT_ON_DEFAULT_BRANCH`', report_text)
        self.assertIn('EN: Apply BOOTSTRAP-001 Phase 1', report_text)
        self.assertIn("TR: BOOTSTRAP-001 Faz 1'i uygulayın", report_text)
        self.assertIn('RU: Выполните этап 1 BOOTSTRAP-001', report_text)
        self.assertIn('PR #202', report_text)

    def test_p2_finding_drives_fix_then_rerun(self) -> None:
        data = base_inputs()
        data['comments'] = [comment('@codex review')]
        data['reviews'] = [review('No findings.', 'chatgpt-codex-connector')]
        data['threads_data'] = threads(thread_comment('P2 Missing request binding.', 'chatgpt-codex-connector'))
        data['checks']['check_runs'] = [check('Security contract')]
        report_text = MODULE.build_report(**data)
        self.assertIn('**Overall conclusion:** **FIX_THEN_RERUN**', report_text)
        self.assertIn('P2x1', report_text)

    def test_required_ci_failure_blocks(self) -> None:
        data = base_inputs()
        data['checks']['check_runs'] = [check('Security contract', conclusion='failure')]
        report_text = MODULE.build_report(**data)
        self.assertIn('**Overall conclusion:** **BLOCK**', report_text)

    def test_optional_ci_failure_does_not_block(self) -> None:
        data = base_inputs()
        data['comments'] = [comment('/qodo review')]
        data['reviews'] = [review('No findings.', 'qodo-code-review')]
        data['checks']['check_runs'] = [check('Experimental optional bot', conclusion='failure')]
        report_text = MODULE.build_report(**data)
        self.assertIn('Optional failed checks ignored for merge conclusion: Experimental optional bot', report_text)
        self.assertNotIn('**Overall conclusion:** **BLOCK**', report_text)

    def test_truncated_threads_forbid_ready(self) -> None:
        data = base_inputs()
        data['comments'] = [comment('/qodo review')]
        data['reviews'] = [review('No findings.', 'qodo-code-review')]
        data['threads_data'] = threads(complete=False)
        report_text = MODULE.build_report(**data)
        self.assertIn('WAIT_FOR_EVIDENCE', report_text)
        self.assertIn('EVIDENCE_TRUNCATED', report_text)

    def test_missing_immutable_anchor_fails_closed(self) -> None:
        data = base_inputs()
        data['checks'] = {'check_runs': []}
        data['comments'] = [comment('/qodo review')]
        data['reviews'] = [review('No findings.', 'qodo-code-review')]
        report_text = MODULE.build_report(**data)
        self.assertIn('NO_IMMUTABLE_HEAD_ANCHOR', report_text)
        self.assertIn('| Qodo | no | E0 |', report_text)

    def test_resolved_thread_is_not_counted(self) -> None:
        data = base_inputs()
        data['comments'] = [comment('/qodo review')]
        data['reviews'] = [review('No findings.', 'qodo-code-review')]
        data['threads_data'] = threads(
            thread_comment('P1 old issue', 'qodo-code-review'), resolved=True,
        )
        report_text = MODULE.build_report(**data)
        self.assertNotIn('P1x1', report_text)

    def test_coderabbit_status_after_request_counts(self) -> None:
        data = base_inputs()
        data['comments'] = [comment('/qodo review'), comment('@coderabbitai review')]
        data['reviews'] = [review('No findings.', 'qodo-code-review')]
        data['statuses'] = [{
            'context': 'CodeRabbit', 'state': 'success',
            'creator': user('coderabbitai[bot]'), 'created_at': AFTER,
        }]
        report_text = MODULE.build_report(**data)
        self.assertIn('| CodeRabbit | yes | E5 | clean exact-head review |', report_text)

    def test_mermaid_graph_escapes_dynamic_labels(self) -> None:
        bot = MODULE.BotResult(
            name='Grok "reviewer"',
            requested=True,
            level='E2',
            state='line one\nline two',
            reason='quote " and `tick`',
            action='path C:\\temp\nretry',
            findings={f'P{i}': 0 for i in range(4)},
        )
        graph = MODULE.mermaid_graph(
            [bot],
            head_sha=HEAD,
            checks=MODULE.CheckSummary(1, 0, [], []),
            evidence_complete=True,
            conclusion='READY "now"',
        )
        self.assertIn("Grok 'reviewer' request", graph)
        self.assertIn('line one line two', graph)
        self.assertIn("quote ' and 'tick'", graph)
        self.assertIn('READY \'now\'', graph)
        self.assertNotIn('line one\nline two', graph)
        self.assertNotIn('Grok "reviewer" request', graph)


if __name__ == '__main__':
    unittest.main()
