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
CODERABBIT_MARKER = '<!-- coderabbit-reserve -->'
DEFAULT_COMMENT_PATH = Path(tempfile.mkdtemp(prefix='ai-review-cooperation-')) / 'comment.json'
TRUSTED_ASSOCIATIONS = {'OWNER', 'MEMBER', 'COLLABORATOR'}
BOT_LOGINS = {
    'CodeRabbit': {'coderabbitai', 'coderabbitai[bot]'},
    'Codex': {'chatgpt-codex-connector', 'chatgpt-codex-connector[bot]'},
    'Jules': {'jules', 'jules[bot]', 'google-labs-jules[bot]'},
}
ACTIVE_REVIEWERS = {'CodeRabbit'}
ADVISORY_REVIEWERS = {'Codex', 'Jules', 'DeepSeek'}
DORMANT_REVIEWERS = {'Qodo'}
REQUIRED_CHECKS = {
    'Human approval contract', 'Security contract', 'Verify generated runtime',
    'Reviewdog static review', 'CodeQL security analysis',
    'Adversarial browser contract', 'Visual regression', 'OWASP ZAP baseline',
    'Lighthouse performance contract', 'iOS WebKit route gate',
    'AI review contract', 'DeepSeek review contract',
    'AI review cooperation contract', 'CodeRabbit reserve contract',
    'Export reconstructed community reel', 'Taste Journey poster contract',
    'Gallery mobile gate',
}
EXPLICIT_SEVERITY_RE = re.compile(r'\bP([0-3])\b', re.IGNORECASE)
LABEL_TO_SEVERITY = {'blocker': 'P0', 'critical': 'P1', 'major': 'P2', 'minor': 'P3'}
ITALIC_SEGMENT_RE = re.compile(r'_([^_\n]+)_')
REVIEWED_COMMIT_RE = re.compile(
    r'Reviewed\s+commit\s*:\s*[*_]*\s*`?([0-9a-f]{7,40})`?',
    re.IGNORECASE,
)
REASON_CODE_RE = re.compile(r'Reason code:[^`]*`([A-Z0-9_]+)`', re.IGNORECASE)
DISPOSITION_RE = re.compile(
    r'^Disposition:\s*(accepted|rejected-with-evidence|superseded)\s*$',
    re.IGNORECASE | re.MULTILINE,
)
DISPOSITION_TARGET_RE = re.compile(
    r'^Disposition-For-Issue-Comment:\s*(\d+)\s*$',
    re.IGNORECASE | re.MULTILINE,
)
MARKDOWN_RE = re.compile(r'[`*_>#\[\]()!]+')
LIMIT_SIGNAL_PATTERNS = (
    re.compile(r'review limit reached', re.IGNORECASE),
    re.compile(r'rate limit (?:has been )?(?:reached|exceeded|exhausted)', re.IGNORECASE),
    re.compile(r'quota (?:has been )?(?:reached|exceeded|exhausted)', re.IGNORECASE),
    re.compile(r'usage limit (?:has been )?(?:reached|exceeded|exhausted)', re.IGNORECASE),
    re.compile(r'next review available in', re.IGNORECASE),
    re.compile(r'free tier[^\n]{0,80}limit', re.IGNORECASE),
)


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
    waived: bool = False


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


def latest_time_of(item: dict[str, Any]) -> datetime:
    values = [
        item.get('submitted_at'), item.get('created_at'), item.get('createdAt'),
        item.get('updated_at'), item.get('updatedAt'),
    ]
    return max((parse_time(str(value)) for value in values if value), default=parse_time(None))


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
    reviewed = reviewed_commit_of(item)
    return bool(reviewed and len(reviewed) >= 7 and head_sha.lower().startswith(reviewed))


def has_positive_limit_signal(body: str) -> bool:
    text = str(body or '')
    if re.search(
        r'\b(?:no|not|without)\b[^\n.!?]{0,80}\b(?:rate limit|review limit|quota|usage limit)\b',
        text,
        re.IGNORECASE,
    ):
        return False
    return any(pattern.search(text) for pattern in LIMIT_SIGNAL_PATTERNS)


def is_final_coderabbit_comment_evidence(item: dict[str, Any]) -> bool:
    body = body_of(item)
    if has_positive_limit_signal(body):
        return False
    if re.search(r'\b(?:started|starting|queued|in progress|failed|failure|error|unavailable)\b', body, re.IGNORECASE):
        return False
    return bool(
        re.search(r'\bcoderabbit(?:ai)? review\s*:\s*(?:complete|completed)\b', body, re.IGNORECASE)
        or re.search(r'\breview (?:is )?(?:complete|completed)\b', body, re.IGNORECASE)
        or re.search(
            r"\b(?:no|did(?:n't| not) find|found no)\b[^\n]{0,100}\b(?:issue|issues|problem|problems)\b",
            body,
            re.IGNORECASE,
        )
    )


def is_final_codex_comment_evidence(item: dict[str, Any]) -> bool:
    body = body_of(item)
    return bool(
        re.search(r'here are some automated review suggestions for this pull request', body, re.IGNORECASE)
        or re.search(
            r"\bcodex review\s*:\s*(?:did(?:n't| not) find|found no|no)\b[^\n]{0,100}"
            r"\b(?:issue|issues|problem|problems)\b",
            body,
            re.IGNORECASE,
        )
        or re.search(r'\bcodex review\s*:\s*(?:complete|completed)\b', body, re.IGNORECASE)
    )


def command_lines(item: dict[str, Any]) -> set[str]:
    return {line.strip().lower() for line in body_of(item).splitlines() if line.strip()}


def severities_of(body: str) -> set[str]:
    result = {f'P{value}' for value in EXPLICIT_SEVERITY_RE.findall(body)}
    for segment in ITALIC_SEGMENT_RE.findall(body):
        normalized = MARKDOWN_RE.sub('', segment).strip().lower()
        for label, severity in LABEL_TO_SEVERITY.items():
            if re.search(rf'\b{re.escape(label)}\b', normalized):
                result.add(severity)
    return result


def finding_key(item: dict[str, Any], severity: str) -> str:
    path = str(item.get('path') or item.get('file') or '').lower()
    line = str(item.get('line') or item.get('original_line') or '')
    text = MARKDOWN_RE.sub(' ', body_of(item)).lower()
    text = re.sub(r'\s+', ' ', text).strip()[:240]
    return f'{severity}|{path}|{line}|{text}'


def finding_summary(items: Iterable[dict[str, Any]]) -> tuple[dict[str, int], set[str]]:
    keys: set[str] = set()
    counts = {f'P{i}': 0 for i in range(4)}
    for item in items:
        for severity in severities_of(body_of(item)):
            key = finding_key(item, severity)
            if key in keys:
                continue
            keys.add(key)
            counts[severity] += 1
    return counts, keys


def combined_findings(bots: Iterable[BotResult]) -> dict[str, int]:
    unique: dict[str, set[str]] = {f'P{i}': set() for i in range(4)}
    for bot in bots:
        for key in bot.finding_keys:
            severity = key.split('|', 1)[0]
            if severity in unique:
                unique[severity].add(key)
    return {severity: len(keys) for severity, keys in unique.items()}


def dispositioned_issue_comment_ids(comments: list[dict[str, Any]], head_sha: str) -> set[str]:
    by_id = {str(item.get('id')): item for item in comments if item.get('id') is not None}
    exact_head_re = re.compile(rf'^Head:\s*{re.escape(head_sha)}\s*$', re.IGNORECASE | re.MULTILINE)
    dispositioned: set[str] = set()
    for reply in comments:
        body = body_of(reply).replace('`', '')
        target = DISPOSITION_TARGET_RE.search(body)
        if not target or not DISPOSITION_RE.search(body) or not exact_head_re.search(body):
            continue
        if association_of(reply) not in TRUSTED_ASSOCIATIONS:
            continue
        finding = by_id.get(target.group(1))
        if finding is None:
            continue
        if time_of(reply) < time_of(finding) or latest_time_of(reply) < latest_time_of(finding):
            continue
        dispositioned.add(target.group(1))
    return dispositioned


def active_finding_items(items: Iterable[dict[str, Any]], dispositioned_ids: set[str]) -> list[dict[str, Any]]:
    return [item for item in items if str(item.get('id')) not in dispositioned_ids]


def flatten_threads(data: dict[str, Any]) -> tuple[bool, bool, list[dict[str, Any]]]:
    if not isinstance(data, dict) or 'threads' not in data:
        return False, False, []
    complete = bool(data.get('complete', True))
    comments: list[dict[str, Any]] = []
    for thread in data.get('threads') or []:
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


def fresh_action_requests(comments: list[dict[str, Any]], head_time: datetime,
                          head_sha: str) -> list[dict[str, Any]]:
    expected_head = f'exact head: {head_sha.lower()}'
    return [
        item for item in comments
        if login_of(item) == 'github-actions[bot]'
        and CODERABBIT_MARKER in body_of(item)
        and '@coderabbitai review' in command_lines(item)
        and expected_head in command_lines(item)
        and is_after_head(item, head_time)
    ]


def unique_items(items: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in sorted(items, key=time_of):
        identity = str(item.get('id') or item.get('node_id') or f'{login_of(item)}:{time_of(item).isoformat()}:{body_of(item)}')
        if identity in seen:
            continue
        seen.add(identity)
        result.append(item)
    return result


def bot_items(items: Iterable[dict[str, Any]], allowed_logins: set[str],
              head_time: datetime) -> list[dict[str, Any]]:
    allowed = {login.lower() for login in allowed_logins}
    return [item for item in items if login_of(item) in allowed and is_after_head(item, head_time)]


def request_bound_exact_items(items: Iterable[dict[str, Any]], requests: list[dict[str, Any]],
                              head_sha: str) -> list[dict[str, Any]]:
    if not requests:
        return []
    request_at = min(time_of(item) for item in requests)
    return [item for item in items if current_head_evidence(item, head_sha) and time_of(item) >= request_at]


def latest_limit_signal(items: Iterable[dict[str, Any]], requests: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not requests:
        return None
    latest_request_at = max(time_of(item) for item in requests)
    signals = [
        item for item in items
        if time_of(item) >= latest_request_at and has_positive_limit_signal(body_of(item))
    ]
    return max(signals, key=time_of, default=None)


def result_from_exact_evidence(*, name: str, requested: bool,
                               exact_items: list[dict[str, Any]],
                               no_evidence_reason: str,
                               no_evidence_action: str,
                               finding_items: list[dict[str, Any]] | None = None) -> BotResult:
    findings, keys = finding_summary(exact_items if finding_items is None else finding_items)
    if exact_items:
        actionable = bool(keys)
        return BotResult(
            name, requested, 'E4' if actionable else 'E5',
            'findings' if actionable else 'clean exact-head review',
            'ACTIONABLE_FINDINGS' if actionable else 'OK',
            'Resolve findings and rerun on the new head.' if actionable else 'No action.',
            findings, keys)
    if requested:
        return BotResult(name, True, 'E1', 'missing evidence', no_evidence_reason,
                         no_evidence_action, findings)
    return BotResult(name, False, 'E0', 'not requested', 'NO_REQUEST',
                     'Post the canonical review command.', findings)


def dormant_result(name: str) -> BotResult:
    return BotResult(name, False, 'E0', 'disabled', 'DORMANT_PROVIDER',
                     f'No action; {name} is disabled.', {f'P{i}': 0 for i in range(4)}, set())


def classify_bots(*, pr: dict[str, Any], comments: list[dict[str, Any]],
                  reviews: list[dict[str, Any]], review_comments: list[dict[str, Any]],
                  threads: list[dict[str, Any]], threads_available: bool,
                  statuses: list[dict[str, Any]], changed_paths: set[str],
                  head_time: datetime) -> list[BotResult]:
    del statuses
    head_sha = str(pr['head']['sha']).lower()
    review_surface = reviews + (threads if threads_available else review_comments)
    dispositioned_ids = dispositioned_issue_comment_ids(comments, head_sha)

    rabbit_requests = unique_items(
        fresh_requests(comments, '@coderabbitai review', head_time, head_sha)
        + fresh_action_requests(comments, head_time, head_sha)
    )
    rabbit_review_items = bot_items(review_surface, BOT_LOGINS['CodeRabbit'], head_time)
    rabbit_comment_items = [
        item for item in bot_items(comments, BOT_LOGINS['CodeRabbit'], head_time)
        if is_final_coderabbit_comment_evidence(item)
    ]
    rabbit_exact = request_bound_exact_items(
        rabbit_review_items + rabbit_comment_items,
        rabbit_requests,
        head_sha,
    )
    rabbit_limit = latest_limit_signal(
        bot_items(comments, BOT_LOGINS['CodeRabbit'], head_time),
        rabbit_requests,
    ) if not rabbit_exact else None
    if rabbit_exact:
        coderabbit = result_from_exact_evidence(
            name='CodeRabbit', requested=True, exact_items=rabbit_exact,
            finding_items=active_finding_items(rabbit_exact, dispositioned_ids),
            no_evidence_reason='NO_CURRENT_HEAD_EVIDENCE',
            no_evidence_action='Wait for the request-bound CodeRabbit review.')
    elif rabbit_limit:
        coderabbit = BotResult(
            'CodeRabbit', True, 'E2', 'provider limit waived', 'QUOTA_EXHAUSTED',
            'Proceed only with green CI, human approval, a refreshed report and a later D6 seal.',
            {f'P{i}': 0 for i in range(4)}, set(), True)
    else:
        coderabbit = result_from_exact_evidence(
            name='CodeRabbit', requested=bool(rabbit_requests), exact_items=[],
            no_evidence_reason='NO_CURRENT_HEAD_EVIDENCE',
            no_evidence_action='Wait for CodeRabbit or an explicit authenticated limit/quota response.')

    codex_req = fresh_requests(comments, '@codex review', head_time, head_sha)
    codex_review_items = bot_items(review_surface, BOT_LOGINS['Codex'], head_time)
    codex_comment_items = [
        item for item in bot_items(comments, BOT_LOGINS['Codex'], head_time)
        if is_final_codex_comment_evidence(item)
    ]
    codex_exact = request_bound_exact_items(codex_review_items + codex_comment_items, codex_req, head_sha)
    codex = result_from_exact_evidence(
        name='Codex', requested=bool(codex_req), exact_items=codex_exact,
        finding_items=active_finding_items(codex_exact, dispositioned_ids),
        no_evidence_reason='NO_CURRENT_HEAD_EVIDENCE',
        no_evidence_action='Codex is advisory; no merge-blocking action is required.')

    jules_req = fresh_requests(comments, '@jules review', head_time)
    jules_items = bot_items(comments + review_surface, BOT_LOGINS['Jules'], head_time)
    jules_exact = request_bound_exact_items(jules_items, jules_req, head_sha)
    jules = result_from_exact_evidence(
        name='Jules', requested=bool(jules_req), exact_items=jules_exact,
        finding_items=active_finding_items(jules_exact, dispositioned_ids),
        no_evidence_reason='NO_CURRENT_HEAD_EVIDENCE' if jules_items else 'NO_ACK',
        no_evidence_action='Jules is advisory; retry only when useful.')

    deep_req = [item for command in ('/deepseek review', '/deepseek deep-review')
                for item in fresh_requests(comments, command, head_time)]
    deep_items = [item for item in comments if login_of(item) == 'github-actions[bot]'
                  and DEEPSEEK_MARKER in body_of(item) and is_after_head(item, head_time)]
    deep_exact = request_bound_exact_items(deep_items, deep_req, head_sha)
    deepseek = result_from_exact_evidence(
        name='DeepSeek', requested=bool(deep_req), exact_items=deep_exact,
        finding_items=active_finding_items(deep_exact, dispositioned_ids),
        no_evidence_reason='NO_CURRENT_HEAD_EVIDENCE',
        no_evidence_action='DeepSeek is advisory; inspect or retry when useful.')
    latest_deep = max(deep_items, key=time_of, default=None)
    if latest_deep and 'status:** failed' in body_of(latest_deep).lower():
        match = REASON_CODE_RE.search(body_of(latest_deep))
        deepseek.level, deepseek.state = 'E2', 'failed'
        deepseek.reason = match.group(1).upper() if match else 'PROVIDER_UNAVAILABLE'
        deepseek.action = 'Apply the advisory reason-code policy.'
        deepseek.findings = {f'P{i}': 0 for i in range(4)}
        deepseek.finding_keys.clear()
    elif deep_req and not deep_exact and '.github/workflows/deepseek-review.yml' in changed_paths:
        deepseek.level, deepseek.state = 'E2', 'bootstrap pending'
        deepseek.reason = 'BOOTSTRAP_NOT_ON_DEFAULT_BRANCH'
        deepseek.action = 'Merge the bootstrap reviewer first, then test it on another PR.'

    return [coderabbit, dormant_result('Qodo'), codex, jules, deepseek]


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
    required = next(bot for bot in bots if bot.name == 'CodeRabbit')
    if checks.failed_names or combined['P0'] or combined['P1']:
        return 'BLOCK', 'Required CI or a P0/P1 finding blocks merge.'
    if combined['P2']:
        return 'FIX_THEN_RERUN', 'Resolve every unique P2 root cause and request a fresh exact-head review.'
    if not evidence_complete:
        return 'WAIT_FOR_EVIDENCE', 'Evidence pagination was incomplete; READY is forbidden.'
    if checks.pending or not required.requested:
        return 'WAIT_FOR_EVIDENCE', 'Required CI or the exact-head CodeRabbit request is still incomplete.'
    required_complete = required.level in {'E4', 'E5'}
    required_limit_waived = required.waived and required.reason == 'QUOTA_EXHAUSTED'
    if not required_complete and not required_limit_waived:
        return 'WAIT_FOR_EVIDENCE', 'CodeRabbit has neither final exact-head evidence nor an authenticated limit waiver.'
    gaps = [bot.name for bot in bots if bot.name in ADVISORY_REVIEWERS and bot.level not in {'E4', 'E5'}]
    if required_limit_waived:
        gaps.insert(0, 'CodeRabbit')
    if gaps:
        return 'READY_WITH_ADVISORY_GAPS', 'Required controls are green; documented gaps: ' + ', '.join(dict.fromkeys(gaps)) + '.'
    return 'READY', 'Required CI and request-bound CodeRabbit exact-head evidence are complete.'


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
    table = ['| Reviewer | Request | Evidence | State | Waived | Findings | Cause | Next action |',
             '|---|---:|---|---|---:|---|---|---|']
    for bot in bots:
        table.append(f'| {bot.name} | {"yes" if bot.requested else "no"} | {bot.level} | {bot.state} | '
                     f'{"yes" if bot.waived else "no"} | {findings_text(bot.findings)} | `{bot.reason}` | {bot.action} |')
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
Trusted exact-head issue-comment dispositions remove only the referenced finding after the disposition is newer than the finding's latest edit.

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

The conclusion is causal, not a majority vote. Required executable CI, human approval and the request-bound CodeRabbit lane dominate. A submitted exact-head CodeRabbit review produces normal E4/E5 evidence. A positive authenticated CodeRabbit limit/quota response after the latest trusted exact-head request may waive only the external AI-review step and yields `READY_WITH_ADVISORY_GAPS`; silence, progress, generic failure, stale output or third-party claims never waive it. Codex, Jules and DeepSeek are advisory; Qodo is disabled. All active P0–P3 findings still require resolution or exact-head disposition, and D6 must be posted after the latest evidence and dispositions.

_Refresh with `/ai-cooperation report`. Policy: `docs/ai-review-cooperation-policy.md`._
'''


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] != 'report':
        raise SystemExit('Usage: ai-review-cooperation.py report')
    report = build_report(
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
    output = Path(os.environ.get('COMMENT_FILE') or DEFAULT_COMMENT_PATH)
    output.write_text(json.dumps({'body': report}, ensure_ascii=False), encoding='utf-8')
    print(report)


if __name__ == '__main__':
    main()
