#!/usr/bin/env python3
"""Request-bound compatibility layer for the AI cooperation reporter.

The legacy reporter remains the canonical policy and rendering implementation.
This module patches only CodeRabbit evidence selection so a stable provider
comment may be correlated through a fresh exact-head request, its GitHub
``updated_at`` observation, and the unchanged live PR head collected by the
trusted workflow. If a stable comment contains an explicit full SHA, that set
must include the current head. Limit evidence remains separate from clean
walkthrough evidence.
"""

from __future__ import annotations

import importlib.util
import re
import sys
from collections.abc import Iterable
from pathlib import Path
from types import ModuleType
from typing import Any

FULL_SHA_RE = re.compile(r"\b[0-9a-f]{40}\b", re.IGNORECASE)
WALKTHROUGH_MARKERS = ("<!-- walkthrough_start -->", "<!-- review_stack_entry_start -->")
CODERABBIT_LOGINS = {"coderabbitai", "coderabbitai[bot]"}


def load_core() -> ModuleType:
    """Load the unchanged cooperation reporter as the policy core."""
    path = Path(__file__).with_name("ai-review-cooperation.py")
    spec = importlib.util.spec_from_file_location("robis_ai_review_cooperation_core", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load cooperation reporter: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


CORE = load_core()


def has_walkthrough_marker(body: str) -> bool:
    """Return whether a stable CodeRabbit summary/walkthrough marker exists."""
    text = str(body or "")
    return any(marker in text for marker in WALKTHROUGH_MARKERS)


def full_head_references(body: str) -> list[str]:
    """Return every explicit full SHA found in provider text."""
    return [match.group(0).lower() for match in FULL_SHA_RE.finditer(str(body or ""))]


def has_no_conflicting_head_reference(body: str, head_sha: str) -> bool:
    """Allow omitted SHA, but reject text that names only another full SHA."""
    references = full_head_references(body)
    return not references or head_sha.lower() in references


def is_stable_coderabbit_item(item: dict[str, Any]) -> bool:
    """Return whether an item is an authenticated stable CodeRabbit comment."""
    return CORE.login_of(item) in CODERABBIT_LOGINS and has_walkthrough_marker(CORE.body_of(item))


def patched_bot_items(items: Iterable[dict[str, Any]], allowed_logins: set[str],
                      head_time: Any) -> list[dict[str, Any]]:
    """Observe stable CodeRabbit comments by updated_at; preserve legacy rules elsewhere."""
    allowed = {login.lower() for login in allowed_logins}
    result: list[dict[str, Any]] = []
    for item in items:
        if CORE.login_of(item) not in allowed:
            continue
        if is_stable_coderabbit_item(item):
            if CORE.latest_time_of(item) >= head_time:
                result.append(item)
        elif CORE.is_after_head(item, head_time):
            result.append(item)
    return result


def patched_is_final_coderabbit_comment_evidence(item: dict[str, Any]) -> bool:
    """Recognize clean stable walkthroughs without treating quota as review completion."""
    body = CORE.body_of(item)
    if not is_stable_coderabbit_item(item) or CORE.has_positive_limit_signal(body):
        return False
    if re.search(r"\b(?:started|starting|queued|in progress)\b", body, re.IGNORECASE) \
            and "<!-- walkthrough_start -->" not in body:
        return False
    return True


def latest_request_time(requests: list[dict[str, Any]]) -> Any:
    """Return the latest authority-command creation time."""
    return max((CORE.time_of(item) for item in requests), default=CORE.parse_time(None))


def patched_request_bound_exact_items(items: Iterable[dict[str, Any]],
                                      requests: list[dict[str, Any]],
                                      head_sha: str) -> list[dict[str, Any]]:
    """Select native exact-head evidence or request-bound stable walkthroughs."""
    if not requests:
        return []
    request_at = latest_request_time(requests)
    result: list[dict[str, Any]] = []
    for item in items:
        if is_stable_coderabbit_item(item):
            if (
                CORE.latest_time_of(item) >= request_at
                and not CORE.has_positive_limit_signal(CORE.body_of(item))
                and has_no_conflicting_head_reference(CORE.body_of(item), head_sha)
            ):
                result.append(item)
            continue
        if CORE.current_head_evidence(item, head_sha) and CORE.time_of(item) >= request_at:
            result.append(item)
    return result


def requested_head(requests: list[dict[str, Any]]) -> str | None:
    """Extract the full exact head from the latest canonical request."""
    if not requests:
        return None
    latest = max(requests, key=CORE.time_of)
    for line in CORE.command_lines(latest):
        match = re.fullmatch(r"exact head:\s*([0-9a-f]{40})", line, re.IGNORECASE)
        if match:
            return match.group(1).lower()
    return None


def patched_latest_limit_signal(items: Iterable[dict[str, Any]],
                                requests: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Select only request-bound stable CodeRabbit quota evidence."""
    if not requests:
        return None
    request_at = latest_request_time(requests)
    head_sha = requested_head(requests)
    if not head_sha:
        return None
    signals = [
        item for item in items
        if is_stable_coderabbit_item(item)
        and CORE.latest_time_of(item) >= request_at
        and CORE.has_positive_limit_signal(CORE.body_of(item))
        and has_no_conflicting_head_reference(CORE.body_of(item), head_sha)
    ]
    return max(signals, key=CORE.latest_time_of, default=None)


def apply_request_bound_policy(module: ModuleType = CORE) -> ModuleType:
    """Patch only the evidence-selection seams of the legacy reporter."""
    module.bot_items = patched_bot_items
    module.is_final_coderabbit_comment_evidence = patched_is_final_coderabbit_comment_evidence
    module.request_bound_exact_items = patched_request_bound_exact_items
    module.latest_limit_signal = patched_latest_limit_signal
    return module


COOPERATION = apply_request_bound_policy()

# Re-export the core surface so existing callers can use this module directly.
for _name in dir(COOPERATION):
    if _name.startswith("__"):
        continue
    globals().setdefault(_name, getattr(COOPERATION, _name))


def main() -> None:
    """Delegate report rendering to the patched legacy core."""
    COOPERATION.main()


if __name__ == "__main__":
    main()
