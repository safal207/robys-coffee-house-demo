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
DEFAULT_COMMENT_PATH = Path(tempfile.mkdtemp(prefix='ai-review-cooperation-')) / 'comment.json'
TRUSTED_ASSOCIATIONS = {'OWNER', 'MEMBER', 'COLLABORATOR'}
BOT_LOGINS = {
    'Qodo': {'qodo-code-review', 'qodo-code-review[bot]'},
    'Codex': {'chatgpt-codex-connector', 'chatgpt-codex-connector[bot]'},
    'Jules': {'jules', 'jules[bot]', 'google-labs-jules[bot]'},
}
ACTIVE_REVIEWERS = {'Qodo', 'Codex'}
ADVISORY_REVIEWERS = {'Jules', 'DeepSeek'}
REQUIRED_CHECKS = {
    'Human approval contract', 'Security contract', 'Verify generated runtime',
    'Reviewdog static review', 'CodeQL security analysis',
    'Adversarial browser contract', 'Visual regression', 'OWASP ZAP baseline',
    'Lighthouse performance contract', 'iOS WebKit route gate',
    'AI review contract', 'DeepSeek review contract',
    'AI review cooperation contract', 'Export reconstructed community reel',
    'Taste Journey poster contract', 'Gallery mobile gate',
}
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
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def body_of(item: dict[str, Any]) -> str:
    return str(item.get('body') or '')


def login_of(item: dict[str, Any]) -> str:
    user = item.get('user') or item.get('author') or {}
    return str(user.get('login') or '').lower() if isinstance(user, dict) else ''


def association_of(item: dict[str, Any]) -> str:
    return str(item.get('author_association') or item.get('authorAssociation') or '').upper()


def time_of(item: dict[str, Any]) -> datetime:
    return parse_time(str(item.get('submitted_at') or item.get('created_at') or item.get('createdAt') or ''))


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


def command_lines(item: dict[str, Any]) -> set[str]:
    return {line.strip().lower() for line in body_of(item).splitlines() if line.strip()}


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


def fresh_requests(comments: list[dict[str, Any]], command: str, head_time: datetime,
                   head_sha: str | None = None) -> list[dict[str, Any]]:
    expected_command = command.lower()
    expected_head = f'exact head: {head_sha.lower()}' if head_sha else None
    result: list[dict[str, Any]] = []
    for item in comments:
        lines = command_lines(item)
        if expected_command not in lines:
            continue
        if expected_head and expected_head not in lines:
            continue
        if association_of(item) not in TRUSTED_ASSOCIATIONS or not is_after_head(item, head_time):
            continue
        result.append(item)
    return result


def bot_items(items: Iterable[dict[str, Any]], allowed_logins: set[str], head_time: datetime) -> list[dict[str, Any]]:
    allowed = {login.lower() for login in allowed_logins}
    return [item for item in items if login_of(item) in allowed and is_after_head(item, head_time)]


def request_bound_exact_items(
    items: Iterable[dict[str, Any]],
    requests: list[dict[str, Any]],
    head_sha: str,
) -> list[dict[str, Any]]:
    if not requests:
        return []
    request_at = min(time_of(item) for item in requests)
    return [
        item for item in items
        if current_head_evidence(item, head_sha) and time_of(item) >= request_at
    ]


def result_from_exact_evidence(*, name: str, requested: bool, exact_items: list[dict[str, Any]],
                               no_evidence_reason: str, no_evidence_action: str) -> BotResult:
    findings, keys = finding_summary(exact_items)
    if exact_items:
        actionable = bool(keys)
        return BotResult(name, requested, 'E4' if actionable else 'E5',
                         'findings' if actionable else 'clean exact-head review',
                         'ACTIONABLE_FINDINGS' if actionable else 'OK',
                         'Resolve findings and rerun on the new head.' if actionable else 'No action.',
                         findings, keys)
    if requested:
        return BotResult(name, True, 'E1', 'missing evidence', no_evidence_reason,
                         no_evidence_action, findings)
    return BotResult(name, False, 'E0', 'not requested', 'NO_REQUEST',
                     'Post the canonical review command.', findings)


def classify_bots(*, pr: dict[str, Any], comments: list[dict[str, Any]],
                  reviews: list[dict[str, Any]], review_comments: list[dict[str, Any]],
                  threads: list[dict[str, Any]], threads_available: bool,
                  statuses: list[dict[str, Any]], changed_paths: set[str],
                  head_time: datetime) -> list[BotResult]:
    del statuses
    head_sha = str(pr['head']['sha']).lower()
    all_items = reviews + (threads if threads_available else review_comments)

    qodo_req = fresh_requests(comments, '/qodo review', head_time, head_sha)
    qodo_items = bot_items(comments + all_items, BOT_LOGINS['Qodo'], head_time)
    qodo = result_from_exact_evidence(
        name='Qodo', requested=bool(qodo_req),
        exact_items=request_bound_exact_items(qodo_items, qodo_req, head_sha),
        no_evidence_reason='NO_CURRENT_HEAD_EVIDENCE',
        no_evidence_action='Wait for a request-bound native Qodo review or use the documented Codex fallback.')

    codex_req = fresh_requests(comments, '@codex review', head_time, head_sha)
    codex_items = bot_items(comments + all_items, BOT_LOGINS['Codex'], head_time)
    codex = result_from_exact_evidence(
        name='Codex', requested=bool(codex_req),
        exact_items=request_bound_exact_items(codex_items, codex_req, head_sha),
        no_evidence_reason='NO_CURRENT_HEAD_EVIDENCE',
        no_evidence_action='Wait up to 10 minutes, then retry once with @codex review.')

    jules_req = fresh_requests(comments, '@jules review', head_time)
    jules_items = bot_items(comments + all_items, BOT_LOGINS['Jules'], head_time)
    jules = result_from_exact_evidence(
        name='Jules', requested=bool(jules_req),
        exact_items=request_bound_exact_items(jules_items, jules_req, head_sha),
        no_evidence_reason='NO_CURRENT_HEAD_EVIDENCE' if jules_items else 'NO_ACK',
        no_evidence_action='Retry once after 15 minutes; keep the gap advisory.')

    dormant = BotResult(
        'CodeRabbit', False, 'E0', 'dormant', 'DORMANT_PROVIDER',
        'No action while CodeRabbit is disabled.', {f'P{i}': 0 for i in range(4)}, set())

    deep_req = [item for command in ('/deepseek review', '/deepseek deep-review')
                for item in fresh_requests(comments, command, head_time)]
    deep_items = [item for item in comments if login_of(item) == 'github-actions[bot]'
                  and DEEPSEEK_MARKER in body_of(item) and is_after_head(item, head_time)]
    deep_exact = request_bound_exact_items(deep_items, deep_req, head_sha)
    deepseek = result_from_exact_evidence(
        name='DeepSeek', requested=bool(deep_req), exact_items=deep_exact,
        no_evidence_reason='NO_CURRENT_HEAD_EVIDENCE',
        no_evidence_action='Inspect the DeepSeek workflow result and retry once.')
    latest_deep = max(deep_items, key=time_of, default=None)
    if latest_deep and 'status:** failed' in body_of(latest_deep).lower():
        match = REASON_CODE_RE.search(body_of(latest_deep))
        deepseek.level, deepseek.state = 'E2', 'failed'
        deepseek.reason = match.group(1).upper() if match else 'PROVIDER_UNAVAILABLE'
        deepseek.action = 'Apply the reason-code policy, then rerun on the same head.'
        deepseek.findings = {f'P{i}': 0 for i in range(4)}
        deepseek.finding_keys.clear()
    elif deep_req and not deep_exact and '.github/workflows/deepseek-review.yml' in changed_paths:
        deepseek.level, deepseek.state = 'E2', 'bootstrap pending'
        deepseek.reason = 'BOOTSTRAP_NOT_ON_DEFAULT_BRANCH'
        deepseek.action = 'Merge the bootstrap reviewer first, then test it on another PR.'
    return [qodo, codex, jules, dormant, deepseek]


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


def overall_conclusion(bots: list[BotResult], *, checks: CheckSummary,
                       evidence_complete: bool) -> tuple[str, str]:
    combined = combined_findings(bots)
    active = [bot for bot in bots if bot.name in ACTIVE_REVIEWERS]
    active_requested = all(bot.requested for bot in active)
    active_review_complete = any(bot.level in {'E4', 'E5'} for bot in active)
    if checks.failed_names or combined['P0'] or combined['P1']:
        return 'BLOCK', 'Required CI or a P0/P1 finding blocks merge.'
    if combined['P2']:
        return 'FIX_THEN_RERUN', 'Resolve every unique P2 root cause and request fresh exact-head reviews.'
    if not evidence_complete:
        return 'WAIT_FOR_EVIDENCE', 'Evidence pagination was incomplete; READY is forbidden.'
    if checks.pending or not active_requested or not active_review_complete:
        return 'WAIT_FOR_EVIDENCE', 'Required CI or request-bound Qodo/Codex exact-head evidence is still incomplete.'
    gaps = [bot.name for bot in bots if bot.name in ADVISORY_REVIEWERS and bot.level not in {'E4', 'E5'}]
    if gaps:
        return 'READY_WITH_ADVISORY_GAPS', 'Required evidence is green; advisory gaps: ' + ', '.join(gaps) + '.'
    return 'READY', 'Required CI and request-bound Qodo/Codex exact-head reviewer evidence are complete.'


def findings_text(findings: dict[str, int]) -> str:
    values = [f'{name}x{count}' for name, count in findings.items() if count]
    return ', '.join(values) if values else 'none'


def mermaid_graph(bots: list[BotResult], *, head_sha: str, checks: CheckSummary,
                  evidence_complete: bool, conclusion: str) -> str:
    lines = ['flowchart TD', f'  H["Current head {head_sha[:12]}"]',
             f'  CI["Required CI: {checks.passed} passed, {checks.pending} pending, {len(checks.failed_names)} failed"]',
             f'  DATA["Evidence pages: {"complete" if evidence_complete else "truncated"}"]',
             '  H --> CI', '  H --> DATA']
    for index, bot in enumerate(bots, 1):
        lines += [f'  R{index}["{bot.name} request: {"yes" if bot.requested else "no"}"]',
                  f'  E{index}["{bot.level}: {bot.state}"]', f'  C{index}["Cause: {bot.reason}"]',
                  f'  A{index}["Action: {bot.action}"]', f'  H --> R{index}', f'  R{index} --> E{index}',
                  f'  E{index} --> C{index}', f'  C{index} --> A{index}']
    lines += [f'  D["Conclusion: {conclusion}"]', '  CI --> D', '  DATA --> D']
    lines += [f'  A{index} --> D' for index in range(1, len(bots) + 1)]
    return '\n'.join(lines)


def build_report(*, pr: dict[str, Any], head_commit: dict[str, Any], comments: list[dict[str, Any]],
                 reviews: list[dict[str, Any]], review_comments: list[dict[str, Any]],
                 threads_data: dict[str, Any], checks: dict[str, Any],
                 statuses: list[dict[str, Any]], files: list[dict[str, Any]]) -> str:
    head_sha = str(pr['head']['sha']).lower()
    commit = head_commit.get('commit') or {}
    head_time = parse_time(str((commit.get('committer') or {}).get('date')
                               or (commit.get('author') or {}).get('date') or ''))
    available, complete, threads = flatten_threads(threads_data)
    bots = classify_bots(pr=pr, comments=comments, reviews=reviews, review_comments=review_comments,
                         threads=threads, threads_available=available, statuses=statuses,
                         changed_paths={str(item.get('filename') or '') for item in files},
                         head_time=head_time)
    check_summary = classify_checks(checks)
    conclusion, why = overall_conclusion(bots, checks=check_summary, evidence_complete=complete)
    unique = combined_findings(bots)
    table = ['| Reviewer | Request | Evidence | State | Findings | Cause | Next action |',
             '|---|---:|---|---|---|---|---|']
    for bot in bots:
        table.append(f'| {bot.name} | {"yes" if bot.requested else "no"} | {bot.level} | {bot.state} | '
                     f'{findings_text(bot.findings)} | `{bot.reason}` | {bot.action} |')
    graph = mermaid_graph(bots, head_sha=head_sha, checks=check_summary,
                          evidence_complete=complete, conclusion=conclusion)
    failed = ', '.join(check_summary.failed_names) or 'none'
    optional = ', '.join(check_summary.optional_failed_names) or 'none'
    evidence = 'complete' if complete else 'truncated (`EVIDENCE_TRUNCATED`)'
    return f'''{COMMENT_MARKER}
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

The conclusion is causal, not a majority vote: required executable CI and request-bound exact-head Qodo/Codex evidence dominate; CodeRabbit is dormant; duplicate findings are collapsed by normalized root-cause signature; stale, spoofed, pre-request, resolved, truncated, failed, or acknowledgement-only responses never count as merge evidence.

_Refresh with `/ai-cooperation report`. Policy: `docs/ai-review-cooperation-policy.md`._
'''


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] != 'report':
        print('Usage: ai-review-cooperation.py report', file=sys.stderr)
        return 2
    body = build_report(pr=read_json_env('PR_JSON_FILE'), head_commit=read_json_env('HEAD_COMMIT_FILE'),
                        comments=read_json_env('COMMENTS_FILE'), reviews=read_json_env('REVIEWS_FILE'),
                        review_comments=read_json_env('REVIEW_COMMENTS_FILE'),
                        threads_data=read_json_env('THREADS_FILE'), checks=read_json_env('CHECKS_FILE'),
                        statuses=read_json_env('STATUSES_FILE'), files=read_json_env('FILES_FILE'))
    output = Path(os.environ.get('COMMENT_FILE', '').strip() or DEFAULT_COMMENT_PATH)
    output.write_text(json.dumps({'body': body}, ensure_ascii=False), encoding='utf-8')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
