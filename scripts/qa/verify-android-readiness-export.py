#!/usr/bin/env python3
"""Validate a passive readiness observation, independently of the native verdict."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
from urllib.parse import urlparse, parse_qs

def require(ok, reason):
    if not ok:
        raise ValueError(reason)

def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)

def js_length(value):
    return len(value.encode('utf-16-le', errors='surrogatepass')) // 2

def validate(record):
    require(record['schema'] == 'robys.android.readiness-export.v1', 'export schema differs')
    require(record['state'] == 'captured' and record['error'] is None, 'export incomplete')
    require(record['export_after_ms'] == 55000, 'export delay differs')
    clocks = [record[k] for k in ('start_elapsed_ns', 'request_elapsed_ns', 'callback_elapsed_ns', 'written_elapsed_ns')]
    require(all(number(x) and x > 0 for x in clocks) and clocks == sorted(clocks), 'native clock order invalid')
    require(clocks[1] - clocks[0] >= 55_000_000_000, 'export entered early')
    require(all(number(record[k]) and record[k] > 0 for k in ('start_uptime_ms', 'request_uptime_ms', 'written_uptime_ms', 'start_wall_ms', 'request_wall_ms', 'written_wall_ms')), 'native timing metadata invalid')
    require(record['written_uptime_ms'] >= record['request_uptime_ms'], 'written uptime precedes request')
    require(record['request_uptime_ms'] - record['start_uptime_ms'] >= 55000, 'export uptime entered early')
    payload = record['payload']
    uri = urlparse(payload['href'])
    query = parse_qs(uri.query)
    require(uri.scheme == 'https' and uri.netloc == 'safal207.github.io' and uri.path == '/robys-coffee-house-demo/', 'unexpected document')
    require(query.get('entry') == ['android-handoff'], 'wrong entry')
    generation = query.get('handoff-gen', [])
    require(len(generation) == 1 and generation[0].isascii() and generation[0].isdigit() and str(int(generation[0])) == generation[0] and 0 < int(generation[0]) <= 2147483647, 'wrong generation')
    require(generation == ['1'], 'different document generation from original cold launch')
    snapshot = payload['snapshot']
    require(snapshot['schema'] == 'robys.android.readiness.v1', 'snapshot schema differs')
    require(type(snapshot['dropped']) is int and snapshot['dropped'] == 0, 'phase buffer overflow; observation incomplete')
    require(number(snapshot['timeOriginMs']) and snapshot['timeOriginMs'] > 0 and snapshot['timeOriginMs'] == payload['time_origin_ms'], 'document clock differs')
    require(number(payload['now_ms']) and payload['now_ms'] >= 0, 'export JS clock invalid')
    events = snapshot['events']
    require(isinstance(events, list) and 1 <= len(events) <= 128, 'empty or oversized observation')
    last = -1
    for event in events:
        require(isinstance(event, dict) and set(event) <= {'phase', 'atMs', 'detail'}, 'event shape invalid')
        require(isinstance(event['phase'], str) and 1 <= js_length(event['phase']) <= 80, 'phase invalid')
        require(number(event['atMs']) and 0 <= event['atMs'] and last <= event['atMs'] <= payload['now_ms'], 'event clock invalid')
        detail = event.get('detail', '')
        require((isinstance(detail, str) and js_length(detail) <= 160) or number(detail), 'detail invalid')
        last = event['atMs']
    phases = [e['phase'] for e in events]
    require('bootstrap' in phases and 'module-evaluated' in phases, 'required recorder startup absent')
    return {'events': len(events), 'phases': phases, 'generation': int(generation[0]),
            'native_export_round_trip_ms': (clocks[2] - clocks[1]) / 1e6,
            'scope': 'phase observation only; absence of ready is preserved, not synthesized'}

def verify(directory):
    root = Path(directory)
    path = root / 'readiness-observation.json'
    result = {'observation_valid': False, 'claim_boundary': 'does not change the original native verdict; sampled CPU stacks require separate validation'}
    try:
        raw = path.read_bytes()
        result['export_sha256'] = hashlib.sha256(raw).hexdigest()
        result.update(validate(json.loads(raw)))
        result['observation_valid'] = True
    except Exception as error:
        result['error'] = str(error)
    root.mkdir(parents=True, exist_ok=True)
    (root / 'verification.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
    return 0 if result['observation_valid'] else 42

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory')
    sys.exit(verify(parser.parse_args().directory))
