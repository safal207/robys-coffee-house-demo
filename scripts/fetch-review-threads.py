#!/usr/bin/env python3
"""Fetch every pull-request review thread and comment through GitHub GraphQL."""

from __future__ import annotations

import json
import os
import subprocess
import sys
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


def required_env(name: str) -> str:
    value = os.environ.get(name, '').strip()
    if not value:
        raise RuntimeError(f'Missing required environment variable: {name}')
    return value


def graphql(query: str, variables: dict[str, str | int | None]) -> dict[str, Any]:
    command = ['gh', 'api', 'graphql', '-f', f'query={query}']
    for name, value in variables.items():
        if value is None:
            continue
        flag = '-F' if isinstance(value, int) else '-f'
        command.extend([flag, f'{name}={value}'])
    result = subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
        encoding='utf-8',
    )
    payload = json.loads(result.stdout)
    if payload.get('errors'):
        raise RuntimeError(f'GitHub GraphQL returned errors: {payload["errors"]}')
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


def main() -> int:
    repository = required_env('REPOSITORY')
    owner, name = repository.split('/', 1)
    number = int(required_env('PR_NUMBER'))
    output = Path(required_env('THREADS_FILE'))
    output.write_text(
        json.dumps(fetch_all(owner, name, number), ensure_ascii=False),
        encoding='utf-8',
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
