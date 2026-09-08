"""Replay this archived observation; never run an emulator or modify product code."""
import argparse
import collections
import csv
import hashlib
import json
from pathlib import Path
import subprocess


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sections(path):
    result = collections.defaultdict(list)
    header = []
    for row in csv.reader(path.open()):
        if not row:
            continue
        if row[0] == 'section':
            header = row
        else:
            assert len(row) == len(header), 'malformed query result'
            result[row[0]].append(dict(zip(header[1:], row[1:])))
    return result


def intervals_union(intervals):
    merged = []
    for start, end in sorted(intervals):
        if end <= start:
            continue
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(end, merged[-1][1])
        else:
            merged.append([start, end])
    return merged


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--artifact', type=Path, required=True)
parser.add_argument('--zip', type=Path, required=True)
parser.add_argument('--tooling', type=Path, required=True)
parser.add_argument('--reconstructed', type=Path, required=True)
parser.add_argument('--trace-processor', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
evidence = Path(__file__).resolve().parent
expected = json.loads((evidence / 'independent-review.json').read_text())
reconstruction = json.loads((evidence / 'reconstruction-check.json').read_text())
assert digest(args.zip) == expected['artifact_zip_sha256'], 'wrong ZIP'
assert (args.artifact / 'diagnostic-tooling.sha').read_text().strip() == expected['tooling_sha']
assert json.loads((args.artifact / 'fixture-manifest.json').read_text())['source_sha'] == expected['subject_sha']
assert digest(args.artifact / 'readiness-evidence/readiness-observation.json') == digest(evidence / 'readiness-observation.json')
for path, sha256 in expected['inputs_sha256'].items():
    marker = '/readiness-observation-34229226048/'
    if marker in path:
        assert digest(args.artifact / path.split(marker, 1)[1]) == sha256, path
for row in reconstruction['prepared_files']:
    assert digest(args.artifact / row['path']) == row['sha256'], row['path']
    assert digest(args.reconstructed / row['path']) == row['sha256'], row['path']
for row in reconstruction['tool_files']:
    data = subprocess.check_output(['git', 'show', expected['tooling_sha'] + ':' + row['path']], cwd=args.tooling)
    assert hashlib.sha256(data).hexdigest() == row['sha256'], row['path']
assert not args.output.exists(), 'use a new replay output directory'
args.output.mkdir(parents=True)
for query in ('profile', 'native-states', 'native-reveal'):
    with (args.output / (query + '.csv')).open('w') as out, (args.output / (query + '.stderr.txt')).open('w') as err:
        subprocess.run([str(args.trace_processor), 'query', '-f', str(evidence / ('query-' + query + '.sql')),
                        str(args.artifact / 'trace-evidence/launch.pftrace')], stdout=out, stderr=err, check=True, timeout=120)
profile = sections(args.output / 'profile.csv')
states = sections(args.output / 'native-states.csv')
assert len(profile['launch_inventory']) == 1
assert int(profile['launch_inventory'][0]['pid']) == expected['native_pid']
assert int(profile['gpu_identity'][0]['tid']) == expected['gpu_tid']
assert [r['msg'] for r in profile['handoff_nodes']] == list(expected['native_ms'])
assert len(profile['profile_samples']) == expected['profile']['total_samples']
assert len(profile['gpu_samples']) == expected['profile']['gpu_samples']
assert all(s['callsite_id'] == '[NULL]' for s in profile['profile_samples'])
assert states['draw_thread_state'] == expected['draw_states']
assert states['draw_app_samples'] == expected['draw_samples']
snapshot = json.loads((evidence / 'readiness-observation.json').read_text())
origin = [snapshot[k] - round(snapshot['payload']['now_ms'] * 1e6)
          for k in ('request_elapsed_ns', 'callback_elapsed_ns')]
assert origin == expected['readiness']['origin_native_ns_interval']
raw = json.loads((args.artifact / 'rendering-evidence/rendering-trace.json').read_text())['traceEvents']
spans = [dict(e, start_ns=round(e['ts'] * 1000), end_ns=round(e['ts'] * 1000) + round(e['dur'] * 1000))
         for e in raw if e.get('ph') == 'X']
gpu = [e for e in spans if e['tid'] == expected['gpu_tid']]
tails = []
for outer in (e for e in gpu if e['name'] == 'RasterDecoderImpl::DoEndRasterCHROMIUM'):
    flushes = [e for e in gpu if e['name'] == 'RasterDecoderImpl::DoEndRasterCHROMIUM::Flush'
               and outer['start_ns'] <= e['start_ns'] and e['end_ns'] <= outer['end_ns']]
    if flushes:
        tails.append((max(e['end_ns'] for e in flushes), outer['end_ns']))
for window in expected['internal_windows']:
    start, end = window['start_ns'], window['end_ns']
    for family in window['families_kept_separate']:
        relevant = [e for e in spans if e['tid'] == family['tid'] and e['pid'] == family['pid']
                    and e['name'] == family['name'] and e['start_ns'] < end and e['end_ns'] > start]
        union = intervals_union((max(start, e['start_ns']), min(end, e['end_ns'])) for e in relevant)
        assert len(relevant) == family['overlapping_count']
        assert sum(b - a for a, b in union) == family['clipped_union_ns']
    for tail in (x for x in expected['raster_tail_windows'] if x['window'] == window['label']):
        union = intervals_union((max(start, a), min(end, b)) for a, b in tails)
        assert union == tail['intervals']
        samples = [s for s in profile['gpu_samples'] if any(a <= int(s['ts']) < b for a, b in union)]
        assert len(samples) == tail['gpu_samples']
result = {'replay': 'PASS', 'run_id': expected['run_id'], 'native_outcome': expected['native_outcome'],
          'prepared_files': len(reconstruction['prepared_files']), 'tool_files': len(reconstruction['tool_files']),
          'readiness_events': len(snapshot['payload']['snapshot']['events']),
          'profile_samples': len(profile['profile_samples']), 'gpu_samples': len(profile['gpu_samples']),
          'function_attribution': 'UNAVAILABLE_NO_CALLSITES',
          'boundary': 'Evidence replay only; native failure, missing function attribution and release limits remain unchanged.'}
(args.output / 'replay-result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
