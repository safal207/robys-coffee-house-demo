#!/usr/bin/env python3
"""Build a deterministic causal cooperation report for PR review bots and CI."""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

COMMENT_MARKER = '<!-- ai-review-cooperation -->'
DEEPSEEK_MARKER = '<!-- deepseek-pr-review -->'
GROK_MARKER = '<!-- grok-pr-review -->'
DEFAULT_COMMENT_PATH = Path(tempfile.mkdtemp(prefix='ai-review-cooperation-')) / 'comment.json'
TRUSTED_ASSOCIATIONS = {'OWNER', 'MEMBER', 'COLLABORATOR'}
BOT_LOGINS = {
    'Qodo': {'qodo-code-review', 'qodo-code-review[bot]'},
    'Codex': {'chatgpt-codex-connector', 'chatgpt-codex-connector[bot]'},
    'Jules': {'jules', 'jules[bot]', 'google-labs-jules[bot]'},
    'CodeRabbit': {'coderabbitai', 'coderabbitai[bot]'},
}
REQUIRED_CHECKS = {
    'Human approval contract', 'Security contract', 'Verify generated runtime',
    'Reviewdog static review', 'CodeQL security analysis',
    'Adversarial browser contract', 'Visual regression', 'OWASP ZAP baseline',
    'Lighthouse performance contract', 'iOS WebKit route gate',
    'AI review contract', 'DeepSeek review contract',
    'AI review cooperation contract', 'Export reconstructed community reel',
    'Taste Journey poster contract', 'Gallery mobile gate',
}
AI_REVIEW_ANCHOR_NAMES = {'Verify exact-head independent review', 'AI review contract'}
EXPLICIT_SEVERITY_RE = re.compile(r'\bP([0-3])\b', re.IGNORECASE)
LABEL_TO_SEVERITY = {'blocker': 'P0', 'critical': 'P1', 'major': 'P2', 'minor': 'P3'}
ITALIC_SEGMENT_RE = re.compile(r'_([^_\n]+)_')
REVIEWED_COMMIT_RE = re.compile(r'Reviewed commit:[^`]*`([0-9a-f]{40})`', re.IGNORECASE)
REASON_CODE_RE = re.compile(r'Reason code:[^`]*`([A-Z0-9_]+)`', re.IGNORECASE)
MARKDOWN_RE = re.compile(r'[`*_>#\[\]()!]+')


@dataclass
class BotResult:
    name: str
    requested: bool
    level: str
    state: str
    reason: str
    action: str
    findings: dict[str, int]
    finding_keys: set[str] = field(default_factory=set)


@dataclass
class CheckSummary:
    passed: int
    pending: int
    failed_names: list[str]
    optional_failed_names: list[str]


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
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)


def body_of(item: dict[str, Any]) -> str:
    return str(item.get('body') or '')


def login_of(item: dict[str, Any]) -> str:
    user = item.get('user') or item.get('author') or {}
    return str(user.get('login') or '').lower() if isinstance(user, dict) else ''


def user_type_of(item: dict[str, Any]) -> str:
    user = item.get('user') or item.get('author') or {}
    return str(user.get('type') or user.get('__typename') or '') if isinstance(user, dict) else ''


def association_of(item: dict[str, Any]) -> str:
    return str(item.get('author_association') or item.get('authorAssociation') or '').upper()


def time_of(item: dict[str, Any]) -> datetime:
    return parse_time(str(item.get('submitted_at') or item.get('created_at') or item.get('createdAt') or ''))


def command_lines_of(item: dict[str, Any]) -> list[str]:
    return [line.strip().lower() for line in body_of(item).splitlines() if line.strip()]


def active_submitted_review(item: dict[str, Any]) -> bool:
    state = str(item.get('state') or '').upper()
    return bool(item.get('submitted_at')) and state not in {'PENDING', 'DISMISSED'}


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


def immutable_head_anchor(checks: dict[str, Any]) -> datetime:
    """Return a GitHub-server timestamp for the exact-head AI contract run.

    Commit author/committer timestamps are deliberately not accepted because they can be
    backdated. Tests may provide ``head_update_anchor`` directly; production derives the
    anchor from the current-head check run returned by GitHub's checks API.
    """
    explicit = checks.get('head_update_anchor')
    if isinstance(explicit, str) and explicit:
        return parse_time(explicit)

    candidates: list[tuple[int, datetime]] = []
    for check in checks.get('check_runs') or []:
        if str(check.get('name') or '') not in AI_REVIEW_ANCHOR_NAMES:
            continue
        timestamp = parse_time(str(check.get('started_at') or check.get('created_at') or ''))
        if timestamp == datetime.min.replace(tzinfo=timezone.utc):
            continue
        candidates.append((int(check.get('id') or 0), timestamp))
    if not candidates:
        return datetime.max.replace(tzinfo=timezone.utc)
    return max(candidates, key=lambda value: value[0])[1]


def severities_of(body: str) -> set[str]:
    result = {f'P{value}' for value in EXPLICIT_SEVERITY_RE.findall(body)}
    for segment in ITALIC_SEGMENT_RE.findall(body):
        normalized = segment.lower()
        for label, severity in LABEL_TO_SEVERITY.items():
            if re.search(rf'\b{label}\b', normalized):
                result.add(severity)
    return result


def normalized_finding_text(item: dict[str, Any], severity: str) -> str:
    text = MARKDOWN_RE.sub(' ', body_of(item).lower())
    text = re.sub(r'useful\?.*$', '', text, flags=re.DOTALL)
    text = re.sub(r'\s+', ' ', text).strip()
    path = str(item.get('path') or '')
    line = str(item.get('line') or item.get('original_line') or item.get('originalLine') or '')
    return f'{severity}|{path}|{line}|{text[:320]}'


def finding_summary(items: Iterable[dict[str, Any]]) -> tuple[dict[str, int], set[str]]:
    unique: dict[str, str] = {}
    for item in items:
        for severity in severities_of(body_of(item)):
            unique.setdefault(normalized_finding_text(item, severity), severity)
    counts = {f'P{i}': 0 for i in range(4)}
    for severity in unique.values():
        counts[severity] += 1
    return counts, set(unique)


def combined_findings(bots: Iterable[BotResult]) -> dict[str, int]:
    unique: dict[str, str] = {}
    for bot in bots:
        for key in bot.finding_keys:
            unique.setdefault(key, key.split('|', 1)[0])
    counts = {f'P{i}': 0 for i in range(4)}
    for severity in unique.values():
        if severity in counts:
            counts[severity] += 1
    return counts


def flatten_threads(data: dict[str, Any]) -> tuple[bool, bool, list[dict[str, Any]]]:
    if isinstance(data.get('threads'), list):
        nodes = data['threads']
        complete = bool(data.get('complete', False))
    else:
        try:
            connection = data['data']['repository']['pullRequest']['reviewThreads']
            nodes = connection.get('nodes') or []
            complete = not bool((connection.get('pageInfo') or {}).get('hasNextPage'))
        except (KeyError, TypeError):
            return False, False, []
    comments: list[dict[str, Any]] = []
    for thread in nodes:
        if thread.get('isResolved'):
            continue
        connection = thread.get('comments') or {}
        if (connection.get('pageInfo') or {}).get('hasNextPage'):
            complete = False
        comments.extend(connection.get('nodes') or [])
    return True, complete, comments


def fresh_requests(
    comments: list[dict[str, Any]],
    commands: str | Iterable[str],
    head_update_anchor: datetime,
) -> list[dict[str, Any]]:
    accepted = {commands.lower()} if isinstance(commands, str) else {item.lower() for item in commands}
    return [
        item for item in comments
        if association_of(item) in TRUSTED_ASSOCIATIONS
        and time_of(item) >= head_update_anchor
        and any(command in accepted for command in command_lines_of(item))
    ]


def latest_request_at(requests: Iterable[dict[str, Any]], fallback: datetime) -> datetime:
    return max((time_of(item) for item in requests), default=fallback)


def bot_items(
    items: Iterable[dict[str, Any]],
    allowed_logins: set[str],
    not_before: datetime,
) -> list[dict[str, Any]]:
    allowed = {login.lower() for login in allowed_logins}
    return [item for item in items if login_of(item) in allowed and time_of(item) >= not_before]


def result_from_exact_evidence(
    *,
    name: str,
    requested: bool,
    exact_items: list[dict[str, Any]],
    no_evidence_reason: str,
    no_evidence_action: str,
) -> BotResult:
    findings, keys = finding_summary(exact_items)
    if exact_items:
        actionable = bool(keys)
        return BotResult(
            name,
            requested,
            'E4' if actionable else 'E5',
            'findings' if actionable else 'clean exact-head review',
            'ACTIONABLE_FINDINGS' if actionable else 'OK',
            'Resolve findings and rerun on the new head.' if actionable else 'No action.',
            findings,
            keys,
        )
    if requested:
        return BotResult(
            name, True, 'E1', 'missing evidence', no_evidence_reason,
            no_evidence_action, findings,
        )
    return BotResult(
        name, False, 'E0', 'not requested', 'NO_REQUEST',
        'Post the canonical review command.', findings,
    )


def action_comment_evidence(
    comments: list[dict[str, Any]],
    marker: str,
    head_sha: str,
    request_at: datetime,
) -> list[dict[str, Any]]:
    return [
        item for item in comments
        if login_of(item) == 'github-actions[bot]'
        and marker in body_of(item)
        and time_of(item) >= request_at
        and current_head_evidence(item, head_sha)
    ]


def classify_bots(
    *,
    pr: dict[str, Any],
    comments: list[dict[str, Any]],
    reviews: list[dict[str, Any]],
    review_comments: list[dict[str, Any]],
    threads: list[dict[str, Any]],
    threads_available: bool,
    statuses: list[dict[str, Any]],
    changed_paths: set[str],
    head_update_anchor: datetime,
) -> list[BotResult]:
    head_sha = str(pr['head']['sha']).lower()
    unresolved_items = threads if threads_available else review_comments
    all_items = reviews + unresolved_items + comments

    qodo_req = fresh_requests(comments, '/qodo review', head_update_anchor)
    qodo_request_at = latest_request_at(qodo_req, head_update_anchor)
    qodo_native_reviews = [
        item for item in reviews
        if login_of(item) in {login.lower() for login in BOT_LOGINS['Qodo']}
        and user_type_of(item) == 'Bot'
        and active_submitted_review(item)
        and time_of(item) >= qodo_request_at
        and current_head_evidence(item, head_sha)
    ]
    qodo_findings = [
        item for item in bot_items(unresolved_items, BOT_LOGINS['Qodo'], qodo_request_at)
        if current_head_evidence(item, head_sha)
    ]
    qodo = result_from_exact_evidence(
        name='Qodo',
        requested=bool(qodo_req),
        exact_items=(qodo_native_reviews + qodo_findings) if qodo_req and qodo_native_reviews else [],
        no_evidence_reason='NO_CURRENT_HEAD_EVIDENCE',
        no_evidence_action='Post /qodo review, then wait for the automatic Qodo review on the current head.',
    )

    def native_bot(name: str, command: str, action: str) -> BotResult:
        requests = fresh_requests(comments, command, head_update_anchor)
        request_at = latest_request_at(requests, head_update_anchor)
        items = [
            item for item in bot_items(all_items, BOT_LOGINS[name], request_at)
            if current_head_evidence(item, head_sha)
        ]
        return result_from_exact_evidence(
            name=name,
            requested=bool(requests),
            exact_items=items if requests else [],
            no_evidence_reason='NO_CURRENT_HEAD_EVIDENCE',
            no_evidence_action=action,
        )

    codex = native_bot('Codex', '@codex review', 'Wait up to 10 minutes, then retry once with @codex review.')
    jules = native_bot('Jules', '@jules review', 'Retry once after 15 minutes; keep the gap advisory.')

    rabbit_req = fresh_requests(comments, '@coderabbitai review', head_update_anchor)
    rabbit_request_at = latest_request_at(rabbit_req, head_update_anchor)
    rabbit_items = bot_items(all_items, BOT_LOGINS['CodeRabbit'], rabbit_request_at)
    rabbit_reviews = [
        item for item in rabbit_items
        if current_head_evidence(item, head_sha)
        and 'review in progress' not in body_of(item).lower()
        and 'currently processing' not in body_of(item).lower()
        and 'review failed' not in body_of(item).lower()
    ]
    rabbit_statuses = [
        item for item in statuses
        if str(item.get('context') or '') == 'CodeRabbit'
        and str(item.get('state') or '') == 'success'
        and login_of({'user': item.get('creator') or {}}) in BOT_LOGINS['CodeRabbit']
        and time_of(item) >= rabbit_request_at
    ]
    rabbit_exact = rabbit_reviews + rabbit_statuses if rabbit_req else []
    rabbit = result_from_exact_evidence(
        name='CodeRabbit', requested=bool(rabbit_req), exact_items=rabbit_exact,
        no_evidence_reason='NO_ACK', no_evidence_action='Retry once after 15 minutes.',
    )
    latest_rabbit = max(rabbit_items, key=time_of, default=None)
    if not rabbit_exact and latest_rabbit:
        text = body_of(latest_rabbit).lower()
        if 'failed to replace' in text or 'insufficient permissions' in text:
            rabbit.level, rabbit.state, rabbit.reason = 'E2', 'permission failure', 'PERMISSION_ERROR'
            rabbit.action = 'Fix comment ownership/permissions, then retry once.'
        elif 'review failed' in text or 'failure by coderabbit' in text:
            rabbit.level, rabbit.state, rabbit.reason = 'E2', 'provider failure', 'PROVIDER_UNAVAILABLE'
            rabbit.action = 'Retry once; keep the outage advisory if CI remains healthy.'
        elif 'review in progress' in text or 'currently processing' in text:
            rabbit.level, rabbit.state, rabbit.reason = 'E2', 'in progress', 'ACK_ONLY'
            rabbit.action = 'Wait to the 15-minute timeout before one retry.'

    def action_bot(
        *, name: str, commands: tuple[str, ...], marker: str,
        workflow_path: str, action: str,
    ) -> BotResult:
        requests = fresh_requests(comments, commands, head_update_anchor)
        request_at = latest_request_at(requests, head_update_anchor)
        exact = action_comment_evidence(comments, marker, head_sha, request_at) if requests else []
        result = result_from_exact_evidence(
            name=name,
            requested=bool(requests),
            exact_items=exact,
            no_evidence_reason='NO_CURRENT_HEAD_EVIDENCE',
            no_evidence_action=action,
        )
        latest = max(
            [item for item in comments if login_of(item) == 'github-actions[bot]' and marker in body_of(item)],
            key=time_of,
            default=None,
        )
        if latest and time_of(latest) >= request_at and 'status:** failed' in body_of(latest).lower():
            match = REASON_CODE_RE.search(body_of(latest))
            result.level, result.state = 'E2', 'failed'
            result.reason = match.group(1).upper() if match else 'PROVIDER_UNAVAILABLE'
            result.action = 'Apply the reason-code policy, then rerun on the same head.'
            result.findings = {f'P{i}': 0 for i in range(4)}
            result.finding_keys.clear()
        elif requests and not exact and workflow_path in changed_paths:
            result.level, result.state = 'E1', 'bootstrap pending'
            result.reason = 'BOOTSTRAP_NOT_ON_DEFAULT_BRANCH'
            result.action = 'Merge the bootstrap reviewer first, then test it on another PR.'
        return result

    deepseek = action_bot(
        name='DeepSeek',
        commands=('/deepseek review', '/deepseek deep-review'),
        marker=DEEPSEEK_MARKER,
        workflow_path='.github/workflows/deepseek-review.yml',
        action='Inspect the DeepSeek workflow result and retry once.',
    )
    grok = action_bot(
        name='Grok',
        commands=('/grok review', '/grok deep-review'),
        marker=GROK_MARKER,
        workflow_path='.github/workflows/grok-review.yml',
        action='Inspect the Grok workflow result and retry once.',
    )
    return [qodo, codex, jules, rabbit, deepseek, grok]


def classify_checks(checks: dict[str, Any]) -> CheckSummary:
    latest: dict[str, dict[str, Any]] = {}
    for check in checks.get('check_runs') or []:
        name = str(check.get('name') or 'unnamed check')
        if name == 'AI review cooperation report':
            continue
        if name not in latest or int(check.get('id') or 0) >= int(latest[name].get('id') or 0):
            latest[name] = check
    passed = pending = 0
    failed: list[str] = []
    optional_failed: list[str] = []
    for name, check in sorted(latest.items()):
        status, conclusion = check.get('status'), check.get('conclusion')
        if name not in REQUIRED_CHECKS:
            if status == 'completed' and conclusion not in {'success', 'neutral', 'skipped'}:
                optional_failed.append(name)
            continue
        if status != 'completed':
            pending += 1
        elif conclusion in {'success', 'neutral', 'skipped'}:
            passed += 1
        else:
            failed.append(name)
    return CheckSummary(passed, pending, failed, optional_failed)


def overall_conclusion(
    bots: list[BotResult], *, checks: CheckSummary, evidence_complete: bool,
) -> tuple[str, str]:
    combined = combined_findings(bots)
    qodo = next(bot for bot in bots if bot.name == 'Qodo')
    if checks.failed_names or combined['P0'] or combined['P1']:
        return 'BLOCK', 'Required CI or a P0/P1 finding blocks merge.'
    if combined['P2']:
        return 'FIX_THEN_RERUN', 'Resolve every unique P2 root cause and request fresh exact-head reviews.'
    if not evidence_complete:
        return 'WAIT_FOR_EVIDENCE', 'Evidence pagination was incomplete; READY is forbidden.'
    if checks.pending or qodo.level not in {'E4', 'E5'}:
        return 'WAIT_FOR_EVIDENCE', 'Required CI or trusted exact-head Qodo evidence is still incomplete.'
    gaps = [bot.name for bot in bots if bot.name != 'Qodo' and bot.level not in {'E4', 'E5'}]
    if gaps:
        return 'READY_WITH_ADVISORY_GAPS', 'Required evidence is green; advisory gaps: ' + ', '.join(gaps) + '.'
    return 'READY', 'Required CI and exact-head reviewer evidence are complete.'


def findings_text(findings: dict[str, int]) -> str:
    values = [f'{name}x{count}' for name, count in findings.items() if count]
    return ', '.join(values) if values else 'none'


def mermaid_graph(
    bots: list[BotResult], *, head_sha: str, checks: CheckSummary,
    evidence_complete: bool, conclusion: str,
) -> str:
    lines = [
        'flowchart TD',
        f'  H["Current head {head_sha[:12]}"]',
        f'  CI["Required CI: {checks.passed} passed, {checks.pending} pending, {len(checks.failed_names)} failed"]',
        f'  DATA["Evidence pages: {"complete" if evidence_complete else "truncated"}"]',
        '  H --> CI', '  H --> DATA',
    ]
    for index, bot in enumerate(bots, 1):
        lines += [
            f'  R{index}["{bot.name} request: {"yes" if bot.requested else "no"}"]',
            f'  E{index}["{bot.level}: {bot.state}"]',
            f'  C{index}["Cause: {bot.reason}"]',
            f'  A{index}["Action: {bot.action}"]',
            f'  H --> R{index}', f'  R{index} --> E{index}',
            f'  E{index} --> C{index}', f'  C{index} --> A{index}',
        ]
    lines += [f'  D["Conclusion: {conclusion}"]', '  CI --> D', '  DATA --> D']
    lines += [f'  A{index} --> D' for index in range(1, len(bots) + 1)]
    return '\n'.join(lines)


def build_report(
    *, pr: dict[str, Any], head_commit: dict[str, Any], comments: list[dict[str, Any]],
    reviews: list[dict[str, Any]], review_comments: list[dict[str, Any]],
    threads_data: dict[str, Any], checks: dict[str, Any], statuses: list[dict[str, Any]],
    files: list[dict[str, Any]],
) -> str:
    del head_commit  # commit timestamps are intentionally not freshness evidence
    head_sha = str(pr['head']['sha']).lower()
    head_update_anchor = immutable_head_anchor(checks)
    available, complete, threads = flatten_threads(threads_data)
    bots = classify_bots(
        pr=pr, comments=comments, reviews=reviews, review_comments=review_comments,
        threads=threads, threads_available=available, statuses=statuses,
        changed_paths={str(item.get('filename') or '') for item in files},
        head_update_anchor=head_update_anchor,
    )
    check_summary = classify_checks(checks)
    conclusion, why = overall_conclusion(bots, checks=check_summary, evidence_complete=complete)
    unique = combined_findings(bots)
    table = [
        '| Reviewer | Request | Evidence | State | Findings | Cause | Next action |',
        '|---|---:|---|---|---|---|---|',
    ]
    for bot in bots:
        table.append(
            f'| {bot.name} | {"yes" if bot.requested else "no"} | {bot.level} | {bot.state} | '
            f'{findings_text(bot.findings)} | `{bot.reason}` | {bot.action} |'
        )
    graph = mermaid_graph(
        bots, head_sha=head_sha, checks=check_summary,
        evidence_complete=complete, conclusion=conclusion,
    )
    failed = ', '.join(check_summary.failed_names) or 'none'
    optional = ', '.join(check_summary.optional_failed_names) or 'none'
    evidence = 'complete' if complete else 'truncated (`EVIDENCE_TRUNCATED`)'
    anchor_text = (
        head_update_anchor.isoformat().replace('+00:00', 'Z')
        if head_update_anchor != datetime.max.replace(tzinfo=timezone.utc)
        else 'missing (`NO_IMMUTABLE_HEAD_ANCHOR`)'
    )
    return f"""{COMMENT_MARKER}
## AI reviewer cooperation report

**Current head:** `{head_sha}`  
**Overall conclusion:** **{conclusion}**  
**Why:** {why}

### Evidence summary

{chr(10).join(table)}

### Causal findings

Unique root causes: **{sum(unique.values())}** — {findings_text(unique)}.
Duplicate REST/GraphQL copies of the same inline finding are counted once.

### CI and collection summary

- Immutable head-update anchor: **{anchor_text}**
- Required checks passed: **{check_summary.passed}**
- Required checks pending: **{check_summary.pending}**
- Required checks failed: **{len(check_summary.failed_names)}**
- Required failed checks: {failed}
- Optional failed checks ignored for merge conclusion: {optional}
- Evidence pagination: **{evidence}**

### Causal graph

```mermaid
{graph}
```

### Decision policy

The conclusion is causal, not a majority vote: required executable CI, a trusted `/qodo review` approval and a request-bound exact-head Qodo Bot review dominate; CodeRabbit, Codex, Jules, DeepSeek and Grok are advisory; duplicate findings are collapsed by normalized root-cause signature; stale, spoofed, pre-request, resolved, truncated, failed, or acknowledgement-only responses never count as merge evidence.

_Refresh with `/ai-cooperation report`. Policy: `docs/ai-review-cooperation-policy.md`._
"""


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
        statuses=read_json_env('STATUSES_FILE'),
        files=read_json_env('FILES_FILE'),
    )
    output = Path(os.environ.get('COMMENT_FILE', '').strip() or DEFAULT_COMMENT_PATH)
    output.write_text(json.dumps({'body': body}, ensure_ascii=False), encoding='utf-8')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
