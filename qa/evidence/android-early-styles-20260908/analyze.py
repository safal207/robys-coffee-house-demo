"""Bounded, offline Android A/B evidence transformation. No Android/browser calls."""
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
            if len(row) != len(header):
                raise ValueError('Malformed query result')
            result[row[0]].append(dict(zip(header[1:], [None if x == '[NULL]' else x for x in row[1:]])))
    return dict(result)


def union(intervals):
    merged = []
    for start, end in sorted(intervals):
        if end <= start:
            continue
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(end, merged[-1][1])
        else:
            merged.append([start, end])
    return merged


def native_windows(native, outcome, completion=None, failure=None):
    windows = []
    if outcome is not None and outcome > native:
        windows.append(('before_outcome', native, outcome))
    if completion is not None:
        windows.append(('after_completion_10s', completion, completion + 10_000_000_000))
    elif failure is not None:
        windows.append(('after_failure_10s_observation_only', failure, failure + 10_000_000_000))
    return windows


def align_readiness(record, native, commit, complete):
    if record.get('state') != 'captured' or record.get('error') is not None:
        return {'available': False, 'state': record.get('state'), 'error': record.get('error')}
    request, callback = record['request_elapsed_ns'], record['callback_elapsed_ns']
    if callback < request or request < record['start_elapsed_ns']:
        raise ValueError('Invalid native export clock order')
    payload = record['payload']
    snapshot = payload['snapshot']
    origin = [request-round(payload['now_ms']*1e6), callback-round(payload['now_ms']*1e6)]
    events = []
    last = -1
    for original in snapshot['events']:
        at = original['atMs']
        if not last <= at <= payload['now_ms']:
            raise ValueError('Invalid JS event clock order')
        last = at
        ns = [v+round(at*1e6) for v in origin]
        events.append(dict(original, elapsed_ns_interval=ns,
                           since_native_ms_interval=[(v-native)/1e6 for v in ns],
                           since_commit_ms_interval=[(v-commit)/1e6 for v in ns] if commit is not None else None))
    def elapsed(start, end):
        a = next((e['atMs'] for e in events if e['phase'] == start), None)
        b = next((e['atMs'] for e in events if e['phase'] == end), None)
        return b-a if a is not None and b is not None else None
    return {'available': True, 'events': events, 'count': len(events), 'dropped': snapshot['dropped'],
            'complete_buffer': snapshot['dropped'] == 0, 'href': payload['href'],
            'origin_elapsed_ns_interval': origin, 'alignment_width_ms': (callback-request)/1e6,
            'export_delay_elapsed_ms': (request-record['start_elapsed_ns'])/1e6,
            'export_after_full_completion_window': request >= complete+10_000_000_000 if complete is not None else None,
            'barrier_ms': {label: elapsed(a, b) for label,a,b in [
                ('dom','dom-wait','dom-resumed'),('styles','styles-wait','styles-ready'),
                ('fonts','fonts-wait','fonts-ready'),('animations','animations-wait','animations-ready'),
                ('two_frames','raf-wait','raf-2')]},
            'alignment_limit': 'Evaluation bracket extrapolated assuming stable same-rate monotonic clocks; no exact midpoint or physical presentation time.'}


def analyze(args):
    artifact, output = args.artifact.resolve(), args.output.resolve()
    if output.exists():
        raise ValueError('Use a new output directory')
    if digest(args.zip) != args.zip_sha256:
        raise ValueError('ZIP digest differs')
    fixture = json.loads((artifact/'fixture-manifest.json').read_text())
    actual_tooling = (artifact/'diagnostic-tooling.sha').read_text().strip()
    inventory = hashlib.sha256(json.dumps(fixture['files'], sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    if fixture['source_sha'] != args.source_sha or actual_tooling != args.tooling_sha or inventory != args.web_sha256:
        raise ValueError('Source, tooling or web inventory differs')
    if len(fixture['files']) != 241:
        raise ValueError('Unexpected web inventory count')
    binding_path = artifact/'experiment-binding.json'
    binding = json.loads(binding_path.read_text()) if binding_path.exists() else None
    if binding is not None:
        if binding['arm'] != args.arm or binding['source_sha'] != args.source_sha or binding['tooling_sha'] != args.tooling_sha:
            raise ValueError('Matrix binding differs')
    output.mkdir(parents=True)
    sql = Path(__file__).with_name('query.sql')
    with (output/'query.csv').open('w') as out, (output/'query.stderr.txt').open('w') as err:
        subprocess.run([str(args.trace_processor), 'query', '-f', str(sql), str(artifact/'trace-evidence/launch.pftrace')],
                       stdout=out, stderr=err, timeout=120, check=True)
    rows = sections(output/'query.csv')
    if len(rows.get('launches', [])) != 1 or rows['launches'][0]['process_name'] != 'com.robys.coffeehouse.debug':
        raise ValueError('Native process identity missing or ambiguous')
    marks = {k:int(v) if v is not None else None for k,v in rows['marks'][0].items()}
    native, commit, complete = marks['native_ts'], marks['commit_ts'], marks['complete_ts']
    windows = native_windows(native, marks['outcome_ts'], complete, marks['failure_ts'])
    if [(r['label'], int(r['start_ns']), int(r['end_ns'])) for r in rows.get('coverage', [])] != windows:
        raise ValueError('Native windows disagree')
    gpu_threads = [t for t in rows['threads'] if (t['name'] or '').startswith('Chrome_InProcG')]
    render_threads = [t for t in rows['threads'] if t['name'] == 'RenderThread']
    if len(gpu_threads) != 1 or len(render_threads) != 1:
        raise ValueError('Render/GPU identity missing or ambiguous')
    gpu_tid, render_tid = int(gpu_threads[0]['tid']), int(render_threads[0]['tid'])
    readiness_path = artifact/'readiness-evidence/readiness-observation.json'
    readiness = align_readiness(json.loads(readiness_path.read_text()), native, commit, complete)
    delivery = []
    for served in rows.get('delivery', []):
        parts = served['msg'].split()
        if len(parts) < 2 or parts[0] != 'SERVED':
            continue
        filename = parts[1]
        if filename not in ('android-app.css','hero-balance.css','mobile-install.css'):
            continue
        index = next((int(e['detail'].split(':',1)[0]) for e in readiness.get('events', [])
                      if e['phase']=='style' and ('/'+filename+'?') in str(e.get('detail'))), None)
        loaded = next((e for e in readiness.get('events', []) if e['phase']=='style-loaded' and e.get('detail')==index), None)
        delivery.append(dict(served, filename=filename, style_index=index,
                             served_to_load_ms_interval=[(v-int(served['ts']))/1e6 for v in loaded['elapsed_ns_interval']] if loaded else None))
    trace_path = artifact/'rendering-evidence/rendering-trace.json'
    internal_payload = json.loads(trace_path.read_text())
    raw = internal_payload['traceEvents']
    spans = [dict(e, event_index=i, start_ns=round(e['ts']*1000), end_ns=round(e['ts']*1000)+round(e['dur']*1000))
             for i,e in enumerate(raw) if e.get('ph')=='X' and e.get('dur',-1)>=0]
    gpu = [e for e in spans if e.get('pid')==marks['pid'] and e.get('tid')==gpu_tid]
    tails = []
    for outer in (e for e in gpu if e['name']=='RasterDecoderImpl::DoEndRasterCHROMIUM'):
        flushes = [e for e in gpu if e['name']=='RasterDecoderImpl::DoEndRasterCHROMIUM::Flush'
                   and outer['start_ns']<=e['start_ns'] and e['end_ns']<=outer['end_ns']]
        if flushes:
            tails.append((max(e['end_ns'] for e in flushes), outer['end_ns']))
    def frame_window(start, end):
        result = []
        for tid in (gpu_tid,render_tid):
            for name in ('RasterDecoderImpl::DoEndRasterCHROMIUM','RasterDecoderImpl::DoEndRasterCHROMIUM::Flush',
                         'shader_compile','BlockingSequenceRunner::Sequence::RunAllTasks::WaitSyncToken'):
                chosen = [e for e in spans if e.get('pid')==marks['pid'] and e.get('tid')==tid and e['name']==name
                          and e['start_ns']<end and e['end_ns']>start]
                if chosen:
                    result.append({'tid':tid,'name':name,'count':len(chosen),
                                   'clipped_union_ns':sum(b-a for a,b in union((max(start,e['start_ns']),min(end,e['end_ns'])) for e in chosen))})
        return result
    draws = {int(w['id']):w for w in rows.get('long_waits',[]) if w['name']=='WebViewFunctor::drawGl'}
    draw_details = []
    for sid, draw in sorted(draws.items(),key=lambda item:int(item[1]['ts'])):
        start,end=int(draw['ts']),int(draw['ts'])+int(draw['dur'])
        intervals=union((max(start,a),min(end,b)) for a,b in tails)
        samples=[s for s in rows.get('gpu_samples',[]) if start<=int(s['ts'])<end]
        tail_samples=[s for s in samples if any(a<=int(s['ts'])<b for a,b in intervals)]
        matched=[e for e in spans if e.get('pid')==marks['pid'] and e.get('tid')==render_tid and e['name']=='DrawFn_DrawGL']
        nearest=min(matched,key=lambda e:abs(e['start_ns']-start)) if matched else None
        draw_details.append({'slice_id':sid,'start_ns':start,'end_ns':end,'full_ms':(end-start)/1e6,
                             'since_native_ms':(start-native)/1e6,'since_completion_ms':(start-complete)/1e6 if complete is not None else None,
                             'internal_scopes':frame_window(start,end), 'post_flush_tail_union_ns':sum(b-a for a,b in intervals),
                             'post_flush_intervals':intervals,'gpu_samples':len(samples),'post_flush_gpu_samples':len(tail_samples),
                             'gpu_samples_with_callsite':sum(s['callsite_id'] is not None for s in samples),
                             'internal_draw_boundary_delta_ns':[nearest['start_ns']-start,nearest['end_ns']-end] if nearest else None,
                             'thread_states':[r for r in rows.get('draw_states',[]) if int(r['draw_id'])==sid]})
    completed_ends=[e['end_ns'] for e in spans]
    actual_ts=[round(e['ts']*1000) for e in raw if e.get('ph')!='M' and isinstance(e.get('ts'),(int,float))]
    internal_status=json.loads((artifact/'rendering-evidence/rendering-trace-status.json').read_text())
    report={'schema':'robys.android.early-styles-comparison-arm.v1','run_id':args.run_id,'arm':args.arm,
            'source_sha':args.source_sha,'tooling_sha':args.tooling_sha,'web_inventory_sha256':inventory,
            'artifact_zip_sha256':args.zip_sha256,'experiment_binding':binding,'marks':marks,
            'handoff':rows.get('handoff',[]),'windows':rows.get('coverage',[]),'readiness':readiness,
            'css_delivery':delivery,'wait_availability':rows.get('wait_availability',[]),
            'long_waits':rows.get('long_waits',[]),'unfinished_waits':rows.get('unfinished_waits',[]),
            'draws':draw_details,'window_thread_states':rows.get('thread_window_states',[]),
            'profile':rows.get('profile_totals',[]),'gpu_sample_count':len(rows.get('gpu_samples',[])),
            'gpu_callsite_count':sum(s['callsite_id'] is not None for s in rows.get('gpu_samples',[])),
            'leaf_mappings':rows.get('leaf_mappings',[]),'stats':rows.get('stats',[]),'metadata':rows.get('metadata',[]),
            'clocks':rows.get('clock',[]),'internal':{'status':internal_status,'byte_count_matches':internal_status['bytes_written']==trace_path.stat().st_size,
              'first_event_ns':min(actual_ts),'last_event_ns':max(actual_ts),'last_complete_end_ns':max(completed_ends),
              'phase_counts':dict(collections.Counter(e.get('ph') for e in raw)),
              'after_completion_coverage':min(actual_ts)<=complete and max(completed_ends)>=complete+10_000_000_000 if complete is not None else None},
            'limits':['One pair of instrumented fresh emulators is not a stable causal speedup estimate.',
                      'Earlier WEB_COMMITTED is not shorter launch-to-readiness or launch-to-completion.',
                      'Markers and JS readiness do not certify uncovered or physical product pixels.',
                      'Thread intervals and nested GPU scopes overlap; never sum them as wall latency.',
                      'Unstacked timebase samples do not establish function or DOM ownership.',
                      'After-failure observations are not a successful post-completion window.',
                      'CSS served/load and fonts-ready barriers are not measured network/download durations.'],
            'hashes':{'query.sql':digest(sql),'analyze.py':digest(Path(__file__)),'query.csv':digest(output/'query.csv'),
                      'trace_processor':digest(args.trace_processor),
                      **{str(p.relative_to(artifact)):digest(p) for p in [artifact/'trace-evidence/launch.pftrace',trace_path,readiness_path]}}}
    (output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'report':str(output/'report.json'),'sha256':digest(output/'report.json'),'marks':marks,
                      'barriers':readiness.get('barrier_ms'),'draws':len(draw_details),'gpu_callsites':report['gpu_callsite_count']}))
    return report


def compare(control, candidate):
    def summary(report):
        marks=report['marks']; native=marks['native_ts']; commit=marks['commit_ts']
        readiness=report['readiness']; ready=next((e for e in readiness.get('events',[]) if e['phase']=='state' and e.get('detail')=='ready'),None)
        return {'source_sha':report['source_sha'],'markers':[r['msg'] for r in report['handoff']],
                'native_to_commit_ms':(commit-native)/1e6 if commit is not None else None,
                'native_to_outcome_ms':(marks['outcome_ts']-native)/1e6 if marks['outcome_ts'] is not None else None,
                'commit_to_outcome_ms':(marks['outcome_ts']-commit)/1e6 if marks['outcome_ts'] is not None and commit is not None else None,
                'ready_since_native_ms_interval':ready['since_native_ms_interval'] if ready else None,
                'ready_since_commit_ms_interval':ready['since_commit_ms_interval'] if ready else None,
                'barriers_ms':readiness.get('barrier_ms'),'alignment_width_ms':readiness.get('alignment_width_ms'),
                'completion':marks['complete_ts'] is not None,'fallback':marks['fallback_ts'] is not None,
                'complete_window':next((r for r in report['windows'] if r['label']=='after_completion_10s'),None),
                'longest_before_outcome_draw_ms':max((int(w['dur'])/1e6 for w in report['long_waits'] if w['label']=='before_outcome' and w['name']=='WebViewFunctor::drawGl'),default=None),
                'longest_after_completion_draw_ms':max((int(w['dur'])/1e6 for w in report['long_waits'] if w['label']=='after_completion_10s' and w['name']=='WebViewFunctor::drawGl'),default=None),
                'gpu_samples':report['gpu_sample_count'],'gpu_callsites':report['gpu_callsite_count']}
    if control['arm']!='control' or candidate['arm']!='candidate':
        raise ValueError('Control/candidate labels differ from the declared pair')
    if control['run_id']!=candidate['run_id'] or control['tooling_sha']!=candidate['tooling_sha']:
        raise ValueError('This comparison requires one declared paired run/tooling')
    bindings=[control.get('experiment_binding'),candidate.get('experiment_binding')]
    if not all(bindings):
        raise ValueError('The controlled pair requires both experiment bindings')
    for key in ('native_tree_sha','workflow_sha256','web_files'):
        if bindings[0][key]!=bindings[1][key]:
            raise ValueError('Controlled binding differs: '+key)
    return {'schema':'robys.android.early-styles-pair.v1','run_id':control['run_id'],'tooling_sha':control['tooling_sha'],
            'control':summary(control),'candidate':summary(candidate),
            'verdict':'OBSERVED_PAIR_ONLY_NOT_RELEASE_CERTIFICATION',
            'limits':control['limits']}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__); commands=parser.add_subparsers(dest='command',required=True)
    arm=commands.add_parser('arm')
    for name in ('artifact','zip','trace-processor','output'): arm.add_argument('--'+name,type=Path,required=True)
    for name in ('zip-sha256','source-sha','tooling-sha','web-sha256','arm'):arm.add_argument('--'+name,required=True)
    arm.add_argument('--run-id',type=int,required=True)
    pair=commands.add_parser('pair');pair.add_argument('--control',type=Path,required=True);pair.add_argument('--candidate',type=Path,required=True);pair.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    if args.command=='arm':analyze(args)
    else:
        result=compare(json.loads(args.control.read_text()),json.loads(args.candidate.read_text()))
        if args.output.exists():raise ValueError('Use a new comparison output')
        args.output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
