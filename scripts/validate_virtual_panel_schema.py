#!/usr/bin/env python3
"""Validate a panel instance with the Draft 2020-12 JSON Schema contract."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker


def main(argv: list[str]) -> int:
    """Validate one JSON instance against one Draft 2020-12 schema."""
    if len(argv) != 3:
        print("Usage: validate_virtual_panel_schema.py <schema.json> <instance.json>", file=sys.stderr)
        return 2
    schema_path, instance_path = map(Path, argv[1:])
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    instance = json.loads(instance_path.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    errors = sorted(
        Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(instance),
        key=lambda error: list(error.absolute_path),
    )
    if errors:
        for error in errors:
            location = "/".join(str(part) for part in error.absolute_path) or "<root>"
            print(f"ERROR schema {location}: {error.message}", file=sys.stderr)
        return 1
    print(f"PASS Draft 2020-12 schema {instance_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
