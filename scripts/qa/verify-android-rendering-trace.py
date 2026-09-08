#!/usr/bin/env python3
"""Validate collection completeness, never native success or shader exclusion."""
import gzip
import hashlib
import json
from pathlib import Path
import sys


def verify(directory):
    directory = Path(directory)
    errors = []
    status = {}
    raw = b''
    events = []
    encoding = 'json'
    try:
        status = json.loads((directory / 'rendering-trace-status.json').read_text())
        if not isinstance(status, dict):
            raise ValueError('status must be an object')
    except (OSError, ValueError) as error:
        errors.append('invalid status: ' + str(error))
        status = {}

    if status.get('state') != 'closed':
        errors.append('output stream has not closed')
    if status.get('reason') != 'timer':
        errors.append('capture did not close after the observation timer')
    if status.get('stop_accepted') is not True:
        errors.append('TracingController did not accept stop')
    if type(status.get('io_error_count')) is not int or status['io_error_count'] != 0:
        errors.append('output stream has an IO error or missing IO count')

    clocks = [status.get(key) for key in (
        'start_elapsed_ns', 'start_returned_elapsed_ns',
        'stop_requested_elapsed_ns', 'closed_elapsed_ns')]
    if not (all(type(value) is int and value > 0 for value in clocks)
            and clocks == sorted(clocks)):
        errors.append('missing or nonmonotonic observer timestamps')

    try:
        raw = (directory / 'rendering-trace.json').read_bytes()
        written = status.get('bytes_written')
        if type(written) is not int or written <= 0 or written != len(raw):
            errors.append('closed byte count does not match nonempty pulled trace')
        if raw.startswith(b'\x1f\x8b'):
            encoding = 'gzip-json'
        payload = gzip.decompress(raw) if encoding == 'gzip-json' else raw
        trace = json.loads(payload)
        if not isinstance(trace, dict) or not isinstance(trace.get('traceEvents'), list):
            raise ValueError('traceEvents must be an array')
        events = trace['traceEvents']
        if not events:
            errors.append('traceEvents is empty')
    except (OSError, ValueError, EOFError) as error:
        errors.append('invalid rendering trace: ' + str(error))

    gpu_events = [event for event in events if isinstance(event, dict)
                  and isinstance(event.get('cat'), str)
                  and 'gpu' in {part.strip() for part in event['cat'].split(',')}
                  and isinstance(event.get('ph'), str)
                  and event['ph'] not in ('', 'M')]
    if not gpu_events:
        errors.append('no actual gpu category event; metadata alone is insufficient')

    report = {
        'schema_version': 1,
        'observation_valid': not errors,
        'errors': errors,
        'observer_status': status,
        'provider': status.get('provider'),
        'requested_categories': status.get('categories'),
        'trace_sha256': hashlib.sha256(raw).hexdigest(),
        'trace_bytes': len(raw),
        'trace_encoding': encoding,
        'trace_event_count': len(events),
        'gpu_event_count': len(gpu_events),
        'claim_boundary': (
            'Collection validation only. It does not change the original native '
            'verdict or establish a cure. Shader-event absence is not shader '
            'exclusion; long-draw coverage and causal analysis remain separate.'),
    }
    (directory / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


def main():
    if len(sys.argv) != 2:
        raise SystemExit('usage: verify-android-rendering-trace.py EVIDENCE_DIRECTORY')
    report = verify(sys.argv[1])
    print(json.dumps({key: report[key] for key in (
        'observation_valid', 'errors', 'trace_sha256', 'trace_bytes',
        'trace_encoding', 'trace_event_count', 'gpu_event_count', 'claim_boundary')}, indent=2))
    return 0 if report['observation_valid'] else 42


if __name__ == '__main__':
    sys.exit(main())
