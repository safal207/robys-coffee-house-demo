#!/usr/bin/env python3
"""Build a deterministic causal cooperation report for PR review bots and CI."""

from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

COMMENT_MARKER = '<!-- ai-review-cooperation -->'
DEFAULT_COMMENT_PATH = Path('/tmp/ai-review-cooperation-comment.json')
SEVERITY_RE = re.compile(r'\bP([0-3])\b', re.IGNORECASE)
REVIEWED_COMMIT_RE = re.compile(r'Reviewed commit:[^`]*`([0-9a-f]{40})`', re.IGNORECASE)
REASON_CODE_RE = re.compile(r'Reason code:[^`]*`([A-Z0-9_]+)`', re.IGNORECASE)


@dataclass
class BotResult:
    name: str
    requested: bool
    level: str
    state: str
    reason: str
    action: str
    findings: dict[str, int]


def required_env(name: str) -> str:
    value = os.environ.get(name, '').strip()
    if not value:
        raise RuntimeError(f'Missing required environment variable: {name}')
    return value


def read_json_env(name: str) -> Any:
    return json.loads(Path(required_env(name)).read_text(encoding='utf-8'))


def parse_time(value: str | None) -> datetime:
    if not value:
        return datetime.min.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def body_of(item: dict[str, Any]) -> str:
    return str(item.get('body') or '')


def login_of(item: dict[str, Any]) -> str:
    user = item.get('user') or item.get('author') or {}
    if isinstance(user, dict):
        return str(user.get('login') or '').lower()
    return ''


def time_of(item: dict[str, Any]) -> datetime:
    return parse_time(
        str(
            item.get('submitted_at')
            or item.get('created_at')
            or item.get('createdAt')
            or ''
        )
    )


def is_after_head(item: dict[str, Any], head_time: datetime) -> bool:
    return time_of(item) >= head_time


def reviewed_commit_of(item: dict[str, Any]) -> str | None:
    commit_id = item.get('commit_id')
    if isinstance(commit_id, str) and commit_id:
        return commit_id.lower()
    commit = item.get('commit')
    if isinstance(commit, dict) and isinstance(commit.get('oid'), str):
        return str(commit['oid']).lower()
    match = REVIEWED_COMMIT_RE.search(body_of(item))
    return match.group(1).lower() if match else None


def current_head_evidence(item: dict[str, Any], head_sha: str) -> bool:
    return reviewed_commit_of(item) == head_sha.lower()


def severity_counts(items: Iterable[dict[str, Any]]) -> dict[str, int]:
    counts = {f'P{i}': 0 for i in range(4)}
    for item in items:
        for value in SEVERITY_RE.findall(body_of(item)):
            counts[f'P{value}'] += 1
    return counts


def merge_counts(*values: dict[str, int]) -> dict[str, int]:
    return {f'P{i}': sum(value.get(f'P{i}', 0) for value in values) for i in range(4)}


def flatten_threads(data: dict[str, Any]) -> list[dict[str, Any]]:
    try:
        nodes = data['data']['repository']['pullRequest']['reviewThreads']['nodes']
    except (KeyError, TypeError):
        return []
    comments: list[dict[str, Any]] = []
    for thread in nodes or []:
        if thread.get('isResolved'):
            continue
        for comment in (thread.get('comments') or {}).get('nodes') or []:
            comments.append(comment)
    return comments


def fresh_requests(
    comments: list[dict[str, Any]],
    command: str,
    head_time: datetime,
) -> list[dict[str, Any]]:
    return [
        item
        for item in comments
        if body_of(item).strip().lower() == command.lower() and is_after_head(item, head_time)
    ]


def bot_items(
    items: Iterable[dict[str, Any]],
    login_needles: tuple[str, ...],
    head_time: datetime,
) -> list[dict[str, Any]]:
    return [
        item
        for item in items
        if any(needle in login_of(item) for needle in login_needles)
        and is_after_head(item, head_time)
    ]


def result_from_exact_evidence(
    *,
    name: str,
    requested: bool,
    exact_items: list[dict[str, Any]],
    no_evidence_reason: str,
    no_evidence_action: str,
) -> BotResult:
    findings = severity_counts(exact_items)
    if exact_items:
        actionable = sum(findings.values()) > 0
        return BotResult(
            name=name,
            requested=requested,
            level='E4',
            state='findings' if actionable else 'reviewed',
            reason='ACTIONABLE_FINDINGS' if actionable else 'OK',
            action='Resolve findings and rerun on the new head.' if actionable else 'No action.',
            findings=findings,
        )
    if requested:
        return BotResult(
            name=name,
            requested=True,
            level='E1',
            state='missing evidence',
            reason=no_evidence_reason,
            action=no_evidence_action,
            findings=findings,
        )
    return BotResult(
        name=name,
        requested=False,
        level='E0',
        state='not requested',
        reason='NO_REQUEST',
        action='Post the canonical review command.',
        findings=findings,
    )


def classify_bots(
    *,
    pr: dict[str, Any],
    comments: list[dict[str, Any]],
    reviews: list[dict[str, Any]],
    review_comments: list[dict[str, Any]],
    threads: list[dict[str, Any]],
    changed_paths: set[str],
    head_time: datetime,
) -> list[BotResult]:
    head_sha = str(pr['head']['sha']).lower()
    all_review_items = reviews + review_comments + threads

    codex_requests = fresh_requests(comments, '@codex review', head_time)
    codex_items = bot_items(
        comments + all_review_items,
        ('chatgpt-codex-connector',),
        head_time,
    )
    codex_exact = [item for item in codex_items if current_head_evidence(item, head_sha)]
    codex = result_from_exact_evidence(
        name='Codex',
        requested=bool(codex_requests),
        exact_items=codex_exact,
        no_evidence_reason='NO_CURRENT_HEAD_EVIDENCE',
        no_evidence_action='Wait up to 10 minutes, then retry once with @codex review.',
    )

    jules_requests = fresh_requests(comments, '@jules review', head_time)
    jules_items = bot_items(comments + all_review_items, ('jules',), head_time)
    jules_exact = [item for item in jules_items if current_head_evidence(item, head_sha)]
    jules = result_from_exact_evidence(
        name='Jules',
        requested=bool(jules_requests),
        exact_items=jules_exact,
        no_evidence_reason='NO_CURRENT_HEAD_EVIDENCE' if jules_items else 'NO_ACK',
        no_evidence_action='Retry once after 15 minutes; keep the gap advisory.',
    )

    rabbit_requests = fresh_requests(comments, '@coderabbitai review', head_time)
    rabbit_items = bot_items(comments + all_review_items, ('coderabbit',), head_time)
    rabbit_exact = [
        item
        for item in rabbit_items
        if current_head_evidence(item, head_sha)
        and 'review in progress' not in body_of(item).lower()
        and 'currently processing' not in body_of(item).lower()
        and 'review failed' not in body_of(item).lower()
    ]
    rabbit = result_from_exact_evidence(
        name='CodeRabbit',
        requested=bool(rabbit_requests),
        exact_items=rabbit_exact,
        no_evidence_reason='NO_ACK',
        no_evidence_action='Retry once after 15 minutes.',
    )
    latest_rabbit = max(rabbit_items, key=time_of, default=None)
    if not rabbit_exact and latest_rabbit:
        text = body_of(latest_rabbit).lower()
        if 'failed to replace' in text or 'insufficient permissions' in text:
            rabbit.level = 'E2'
            rabbit.state = 'permission failure'
            rabbit.reason = 'PERMISSION_ERROR'
            rabbit.action = 'Fix comment ownership/permissions, then retry once.'
        elif 'review failed' in text or 'failure by coderabbit' in text:
            rabbit.level = 'E2'
            rabbit.state = 'provider failure'
            rabbit.reason = 'PROVIDER_UNAVAILABLE'
            rabbit.action = 'Retry once; keep the outage advisory if CI remains healthy.'
        elif 'review in progress' in text or 'currently processing' in text:
            rabbit.level = 'E2'
            rabbit.state = 'in progress'
            rabbit.reason = 'ACK_ONLY'
            rabbit.action = 'Wait to the 15-minute timeout before one retry.'

    deepseek_requests = [
        item
        for command in ('/deepseek review', '/deepseek deep-review')
        for item in fresh_requests(comments, command, head_time)
    ]
    deepseek_items = [
        item
        for item in comments
        if COMMENT_MARKER.replace('ai-review-cooperation', 'deepseek-pr-review') in body_of(item)
        and is_after_head(item, head_time)
    ]
    deepseek_exact = [item for item in deepseek_items if current_head_evidence(item, head_sha)]
    deepseek = result_from_exact_evidence(
        name='DeepSeek',
        requested=bool(deepseek_requests),
        exact_items=deepseek_exact,
        no_evidence_reason='NO_CURRENT_HEAD_EVIDENCE',
        no_evidence_action='Inspect the DeepSeek workflow result and retry once.',
    )
    latest_deepseek = max(deepseek_items, key=time_of, default=None)
    if latest_deepseek and 'status:** failed' in body_of(latest_deepseek).lower():
        match = REASON_CODE_RE.search(body_of(latest_deepseek))
        deepseek.level = 'E3' if not deepseek_exact else 'E4'
        deepseek.state = 'failed'
        deepseek.reason = match.group(1).upper() if match else 'PROVIDER_UNAVAILABLE'
        deepseek.action = 'Apply the reason-code policy, then rerun on the same head.'
    elif (
        deepseek_requests
        and not deepseek_exact
        and '.github/workflows/deepseek-review.yml' in changed_paths
    ):
        deepseek.level = 'E1'
        deepseek.state = 'bootstrap pending'
        deepseek.reason = 'BOOTSTRAP_NOT_ON_DEFAULT_BRANCH'
        deepseek.action = 'Merge the bootstrap reviewer first, then test it on another PR.'

    return [codex, jules, rabbit, deepseek]


def classify_checks(checks: dict[str, Any]) -> tuple[int, int, int, list[str]]:
    passed = 0
    pending = 0
    failed_names: list[str] = []
    for check in checks.get('check_runs') or []:
        name = str(check.get('name') or 'unnamed check')
        if name == 'AI review cooperation report':
            continue
        status = check.get('status')
        conclusion = check.get('conclusion')
        if status != 'completed':
            pending += 1
        elif conclusion in {'success', 'neutral', 'skipped'}:
            passed += 1
        else:
            failed_names.append(name)
    return passed, pending, len(failed_names), failed_names


def overall_conclusion(
    bots: list[BotResult],
    *,
    ci_pending: int,
    ci_failed: int,
) -> tuple[str, str]:
    combined = merge_counts(*(bot.findings for bot in bots))
    codex = next(bot for bot in bots if bot.name == 'Codex')
    if ci_failed or combined['P0'] or combined['P1']:
        return 'BLOCK', 'Required CI or a P0/P1 finding blocks merge.'
    if combined['P2']:
        return 'FIX_THEN_RERUN', 'Resolve every P2 finding and request fresh exact-head reviews.'
    if ci_pending or codex.level not in {'E4', 'E5'}:
        return 'WAIT_FOR_EVIDENCE', 'Required CI or exact-head Codex evidence is still incomplete.'
    advisory_gaps = [
        bot.name
        for bot in bots
        if bot.name != 'Codex' and bot.level not in {'E4', 'E5'}
    ]
    if advisory_gaps:
        return (
            'READY_WITH_ADVISORY_GAPS',
            'Required evidence is green; advisory gaps: ' + ', '.join(advisory_gaps) + '.',
        )
    return 'READY', 'Required CI and exact-head reviewer evidence are complete.'


def findings_text(findings: dict[str, int]) -> str:
    values = [f'{name}×{count}' for name, count in findings.items() if count]
    return ', '.join(values) if values else 'none'


def mermaid_graph(
    bots: list[BotResult],
    *,
    head_sha: str,
    ci_passed: int,
    ci_pending: int,
    ci_failed: int,
    conclusion: str,
) -> str:
    lines = [
        'flowchart TD',
        f'  H["Current head {head_sha[:12]}"]',
        f'  CI["CI: {ci_passed} passed, {ci_pending} pending, {ci_failed} failed"]',
        '  H --> CI',
    ]
    for index, bot in enumerate(bots, start=1):
        request = 'yes' if bot.requested else 'no'
        lines.extend(
            [
                f'  R{index}["{bot.name} request: {request}"]',
                f'  E{index}["{bot.level}: {bot.state}"]',
                f'  C{index}["Cause: {bot.reason}"]',
                f'  A{index}["Action: {bot.action}"]',
                f'  H --> R{index}',
                f'  R{index} --> E{index}',
                f'  E{index} --> C{index}',
                f'  C{index} --> A{index}',
            ]
        )
    lines.append(f'  D["Conclusion: {conclusion}"]')
    lines.append('  CI --> D')
    for index in range(1, len(bots) + 1):
        lines.append(f'  A{index} --> D')
    return '\n'.join(lines)


def build_report(
    *,
    pr: dict[str, Any],
    head_commit: dict[str, Any],
    comments: list[dict[str, Any]],
    reviews: list[dict[str, Any]],
    review_comments: list[dict[str, Any]],
    threads_data: dict[str, Any],
    checks: dict[str, Any],
    files: list[dict[str, Any]],
) -> str:
    head_sha = str(pr['head']['sha']).lower()
    head_time = parse_time(
        str(
            ((head_commit.get('commit') or {}).get('committer') or {}).get('date')
            or ((head_commit.get('commit') or {}).get('author') or {}).get('date')
            or ''
        )
    )
    changed_paths = {str(item.get('filename') or '') for item in files}
    threads = flatten_threads(threads_data)
    bots = classify_bots(
        pr=pr,
        comments=comments,
        reviews=reviews,
        review_comments=review_comments,
        threads=threads,
        changed_paths=changed_paths,
        head_time=head_time,
    )
    ci_passed, ci_pending, ci_failed, failed_names = classify_checks(checks)
    conclusion, conclusion_detail = overall_conclusion(
        bots,
        ci_pending=ci_pending,
        ci_failed=ci_failed,
    )

    table = [
        '| Reviewer | Request | Evidence | State | Findings | Cause | Next action |',
        '|---|---:|---|---|---|---|---|',
    ]
    for bot in bots:
        table.append(
            f'| {bot.name} | {"yes" if bot.requested else "no"} | {bot.level} | '
            f'{bot.state} | {findings_text(bot.findings)} | `{bot.reason}` | {bot.action} |'
        )

    graph = mermaid_graph(
        bots,
        head_sha=head_sha,
        ci_passed=ci_passed,
        ci_pending=ci_pending,
        ci_failed=ci_failed,
        conclusion=conclusion,
    )
    failed_detail = ', '.join(failed_names) if failed_names else 'none'

    return f'''{COMMENT_MARKER}
## AI reviewer cooperation report

**Current head:** `{head_sha}`  
**Overall conclusion:** **{conclusion}**  
**Why:** {conclusion_detail}

### Evidence summary

{chr(10).join(table)}

### CI summary

- Passed: **{ci_passed}**
- Pending: **{ci_pending}**
- Failed: **{ci_failed}**
- Failed checks: {failed_detail}

### Causal graph

```mermaid
{graph}
```

### Decision policy

The conclusion is causal, not a majority vote: executable CI and exact-head evidence dominate; duplicate bot findings are collapsed by root cause; stale or acknowledgement-only responses never count as review evidence.

_Refresh with `/ai-cooperation report`. Policy: `docs/ai-review-cooperation-policy.md`._
'''


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] != 'report':
        print('Usage: ai-review-cooperation.py report', file=sys.stderr)
        return 2
    body = build_report(
        pr=read_json_env('PR_JSON_FILE'),
        head_commit=read_json_env('HEAD_COMMIT_FILE'),
        comments=read_json_env('COMMENTS_FILE'),
        reviews=read_json_env('REVIEWS_FILE'),
        review_comments=read_json_env('REVIEW_COMMENTS_FILE'),
        threads_data=read_json_env('THREADS_FILE'),
        checks=read_json_env('CHECKS_FILE'),
        files=read_json_env('FILES_FILE'),
    )
    output_path = Path(os.environ.get('COMMENT_FILE', '').strip() or DEFAULT_COMMENT_PATH)
    output_path.write_text(
        json.dumps({'body': body}, ensure_ascii=False),
        encoding='utf-8',
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
