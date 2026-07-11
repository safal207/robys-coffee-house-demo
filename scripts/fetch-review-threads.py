#!/usr/bin/env python3
"""Fetch complete PR review threads and derive workflow-level check evidence."""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

THREADS_QUERY = '''
query($owner:String!,$name:String!,$number:Int!,$after:String){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      reviewThreads(first:100,after:$after){
        pageInfo{hasNextPage endCursor}
        nodes{
          id
          isResolved
          comments(first:100){
            pageInfo{hasNextPage endCursor}
            nodes{body createdAt path line originalLine author{login} commit{oid}}
          }
        }
      }
    }
  }
}
'''

COMMENTS_QUERY = '''
query($id:ID!,$after:String){
  node(id:$id){
    ... on PullRequestReviewThread{
      comments(first:100,after:$after){
        pageInfo{hasNextPage endCursor}
        nodes{body createdAt path line originalLine author{login} commit{oid}}
      }
    }
  }
}
'''

RUN_URL = re.compile(r'/actions/runs/([1-9][0-9]*)(?:/|$)')


def required_env(name: str) -> str:
    value = os.environ.get(name, '').strip()
    if not value:
        raise RuntimeError(f'Missing required environment variable: {name}')
    return value


def run_json(command: list[str]) -> dict[str, Any] | list[Any]:
    result = subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
        encoding='utf-8',
    )
    payload = json.loads(result.stdout)
    if isinstance(payload, dict) and payload.get('errors'):
        raise RuntimeError(f'GitHub returned errors: {payload["errors"]}')
    return payload


def graphql(query: str, variables: dict[str, str | int | None]) -> dict[str, Any]:
    command = ['gh', 'api', 'graphql', '-f', f'query={query}']
    for name, value in variables.items():
        if value is None:
            continue
        flag = '-F' if isinstance(value, int) else '-f'
        command.extend([flag, f'{name}={value}'])
    payload = run_json(command)
    if not isinstance(payload, dict):
        raise RuntimeError('GitHub GraphQL returned a non-object payload')
    return payload


def rest(path: str) -> dict[str, Any]:
    payload = run_json(['gh', 'api', path])
    if not isinstance(payload, dict):
        raise RuntimeError(f'GitHub REST returned a non-object payload for {path}')
    return payload


def fetch_remaining_comments(thread: dict[str, Any]) -> None:
    connection = thread.get('comments') or {}
    page_info = connection.get('pageInfo') or {}
    cursor = page_info.get('endCursor')
    while page_info.get('hasNextPage'):
        payload = graphql(COMMENTS_QUERY, {'id': str(thread['id']), 'after': cursor})
        next_connection = payload['data']['node']['comments']
        connection.setdefault('nodes', []).extend(next_connection.get('nodes') or [])
        page_info = next_connection.get('pageInfo') or {}
        cursor = page_info.get('endCursor')
    connection['pageInfo'] = {'hasNextPage': False, 'endCursor': cursor}
    thread['comments'] = connection


def fetch_all(owner: str, name: str, number: int) -> dict[str, Any]:
    threads: list[dict[str, Any]] = []
    cursor: str | None = None
    while True:
        payload = graphql(
            THREADS_QUERY,
            {'owner': owner, 'name': name, 'number': number, 'after': cursor},
        )
        connection = payload['data']['repository']['pullRequest']['reviewThreads']
        for thread in connection.get('nodes') or []:
            fetch_remaining_comments(thread)
            threads.append(thread)
        page_info = connection.get('pageInfo') or {}
        if not page_info.get('hasNextPage'):
            break
        cursor = page_info.get('endCursor')
        if not cursor:
            raise RuntimeError('GitHub reported another review-thread page without a cursor')
    return {'complete': True, 'threads': threads}


def run_id_of(check: dict[str, Any]) -> int | None:
    url = str(check.get('details_url') or check.get('html_url') or '')
    match = RUN_URL.search(url)
    return int(match.group(1)) if match else None


def normalize_workflow_checks(repository: str, expected_head: str) -> None:
    """Preserve raw check runs and derive one exact-head entry per Actions workflow."""
    checks_value = os.environ.get('CHECKS_FILE', '').strip()
    if not checks_value:
        return

    checks_path = Path(checks_value)
    raw_bytes = checks_path.read_bytes()
    raw_payload = json.loads(raw_bytes.decode('utf-8'))
    if not isinstance(raw_payload, dict):
        raise RuntimeError('Check evidence must be a JSON object')
    raw_checks = raw_payload.get('check_runs')
    if not isinstance(raw_checks, list):
        raise RuntimeError('Check evidence is missing check_runs[]')

    raw_value = os.environ.get('RAW_CHECKS_FILE', '').strip()
    raw_path = (
        Path(raw_value)
        if raw_value
        else checks_path.with_name(f'{checks_path.stem}.raw{checks_path.suffix}')
    )
    raw_path.write_bytes(raw_bytes)

    run_ids = sorted({run_id for check in raw_checks if (run_id := run_id_of(check))})
    workflows: list[dict[str, Any]] = []
    for run_id in run_ids:
        item = rest(f'repos/{repository}/actions/runs/{run_id}')
        workflows.append(
            {
                'id': item.get('id'),
                'name': item.get('name'),
                'status': item.get('status'),
                'conclusion': item.get('conclusion'),
                'details_url': item.get('html_url'),
                'head_sha': item.get('head_sha'),
                'event': item.get('event'),
                'app': {'slug': 'github-actions'},
            }
        )

    if len(workflows) != len(run_ids):
        raise RuntimeError(
            f'Workflow metadata collection was incomplete: expected {len(run_ids)}, '
            f'got {len(workflows)}'
        )

    mismatched = [item for item in workflows if item.get('head_sha') != expected_head]
    if mismatched:
        summary = ', '.join(
            f'id={item.get("id")} name={item.get("name")} head={item.get("head_sha")}'
            for item in mismatched
        )
        raise RuntimeError(f'Workflow metadata contains a different head: {summary}')

    external_checks = [check for check in raw_checks if run_id_of(check) is None]
    derived = {'check_runs': workflows + external_checks}

    trigger_event = os.environ.get('TRIGGER_EVENT', '').strip()
    if trigger_event == 'workflow_run':
        trigger_head = os.environ.get('TRIGGER_HEAD_SHA', '').strip().lower()
        if trigger_head != expected_head:
            raise RuntimeError(
                f'Workflow trigger head does not match PR head: {trigger_head or "missing"} '
                f'!= {expected_head}'
            )
        trusted_matches = [
            item
            for item in workflows
            if item.get('name') == 'AI review contract'
            and item.get('status') == 'completed'
            and item.get('conclusion') == 'success'
            and item.get('head_sha') == expected_head
            and item.get('app', {}).get('slug') == 'github-actions'
        ]
        if not trusted_matches:
            raise RuntimeError(
                'Workflow-run evidence lacks a successful exact-head AI review contract'
            )

    checks_path.write_text(
        json.dumps(derived, ensure_ascii=False, separators=(',', ':')),
        encoding='utf-8',
    )
    print(
        'Derived workflow-level check evidence: '
        f'{len(workflows)} Actions workflows, {len(external_checks)} external checks; '
        f'raw evidence preserved at {raw_path}'
    )


def main() -> int:
    repository = required_env('REPOSITORY')
    owner, name = repository.split('/', 1)
    number = int(required_env('PR_NUMBER'))
    output = Path(required_env('THREADS_FILE'))
    output.write_text(
        json.dumps(fetch_all(owner, name, number), ensure_ascii=False),
        encoding='utf-8',
    )

    if os.environ.get('CHECKS_FILE', '').strip():
        pr_file = Path(required_env('PR_JSON_FILE'))
        pr_payload = json.loads(pr_file.read_text(encoding='utf-8'))
        expected_head = str(pr_payload.get('head', {}).get('sha') or '').strip().lower()
        if not re.fullmatch(r'[0-9a-f]{40}', expected_head):
            raise RuntimeError(f'PR evidence contains an invalid head SHA: {expected_head!r}')
        normalize_workflow_checks(repository, expected_head)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
