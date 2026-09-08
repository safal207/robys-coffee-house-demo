#!/usr/bin/env python3
"""Check observation scope and preservation of the existing handoff capture."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'scripts/qa/android-handoff-trace.pbtx'
CONFIG = ROOT / 'scripts/qa/android-raster-callstack.pbtx'


def parse_fields(text):
    """Parse this bounded textproto subset, retaining repeated fields."""
    text = re.sub(r'#[^\n]*', '', text)
    pattern = re.compile(r'\s*("[^"\\]*"|[A-Za-z_][A-Za-z_0-9]*|[0-9]+|[{}:])')
    tokens = []
    position = 0
    while position < len(text):
        if not text[position:].strip():
            break
        match = pattern.match(text, position)
        if not match:
            raise ValueError('Unsupported token')
        tokens.append(match.group(1))
        position = match.end()
    cursor = 0

    def block(nested=False):
        nonlocal cursor
        fields = {}
        while cursor < len(tokens) and tokens[cursor] != '}':
            name = tokens[cursor]
            cursor += 1
            if not re.fullmatch(r'[A-Za-z_][A-Za-z_0-9]*', name):
                raise ValueError('Expected field name')
            if cursor >= len(tokens):
                raise ValueError('Missing field value')
            if tokens[cursor] == '{':
                cursor += 1
                value = block(True)
            else:
                if tokens[cursor] != ':' or cursor + 1 >= len(tokens):
                    raise ValueError('Expected scalar')
                value = tokens[cursor + 1]
                if value in '{}:':
                    raise ValueError('Invalid scalar')
                cursor += 2
            fields.setdefault(name, []).append(value)
        if nested:
            if cursor >= len(tokens) or tokens[cursor] != '}':
                raise ValueError('Unclosed block')
            cursor += 1
        elif cursor != len(tokens):
            raise ValueError('Unexpected closing block')
        return fields

    return block()


def check(config, baseline):
    if not config.startswith(baseline):
        raise ValueError('Original duration, buffers and data sources changed')
    extension = parse_fields(config[len(baseline):].decode())
    if set(extension) != {'buffers', 'data_sources'}:
        raise ValueError('Only an isolated buffer and data source may be added')
    if extension['buffers'] != [{'size_kb': ['32768'], 'fill_policy': ['DISCARD']}]:
        raise ValueError('Unexpected added buffer')
    if len(extension['data_sources']) != 1:
        raise ValueError('Expected one added data source')
    source = extension['data_sources'][0]
    if set(source) != {'config'} or len(source['config']) != 1:
        raise ValueError('Unexpected data source wrapper')
    cfg = source['config'][0]
    if set(cfg) != {'name', 'target_buffer', 'perf_event_config'}:
        raise ValueError('Unexpected perf source fields')
    if cfg['name'] != ['"linux.perf"'] or cfg['target_buffer'] != ['2']:
        raise ValueError('Perf samples must use the dedicated buffer')
    if len(cfg['perf_event_config']) != 1:
        raise ValueError('Expected one perf configuration')
    perf = cfg['perf_event_config'][0]
    if set(perf) != {'timebase', 'callstack_sampling'}:
        raise ValueError('Unexpected perf fields or relaxed failure handling')
    if perf['timebase'] != [{
            'counter': ['SW_CPU_CLOCK'], 'frequency': ['80'],
            'timestamp_clock': ['PERF_CLOCK_MONOTONIC']}]:
        raise ValueError('Sampling rate, counter or clock changed')
    if perf['callstack_sampling'] != [{
            'scope': [{'target_cmdline': ['"com.robys.coffeehouse.debug"']}],
            'kernel_frames': ['false'], 'user_frames': ['UNWIND_DWARF']}]:
        raise ValueError('Process or userspace unwind scope changed')


def main():
    baseline = BASE.read_bytes()
    config = CONFIG.read_bytes()
    check(config, baseline)
    mutations = {
        'duration': config.replace(b'duration_ms: 60000', b'duration_ms: 90000'),
        'original_source': config.replace(b'"linux.ftrace"', b'"linux.missing"'),
        'buffer_alias': config.replace(b'target_buffer: 2', b'target_buffer: 0'),
        'kernel_stacks': config.replace(b'kernel_frames: false', b'kernel_frames: true'),
        'all_processes': config.replace(
            b'scope { target_cmdline: "com.robys.coffeehouse.debug" }', b'scope {}'),
        'wildcard': config.replace(
            b'target_cmdline: "com.robys.coffeehouse.debug"', b'target_cmdline: "com.robys.*"'),
        'extra_process': config.replace(
            b'scope { target_cmdline:', b'scope { target_cmdline: "system_server" target_cmdline:'),
        'higher_frequency': config.replace(b'frequency: 80', b'frequency: 1000'),
        'ignored_open_error': config.replace(
            b'perf_event_config {', b'perf_event_config { ignore_open_failure: true'),
        'missing_user_stacks': config.replace(b'UNWIND_DWARF', b'UNWIND_SKIP'),
        'duplicate_source': config + b'\ndata_sources { config { name: "linux.perf" } }\n',
        'unclosed': config[:-3],
    }
    for name, mutation in mutations.items():
        try:
            check(mutation, baseline)
        except (ValueError, KeyError, UnicodeError):
            continue
        raise AssertionError('Scope mutation accepted: ' + name)
    print('Raster callstack config: preservation/scope PASS; 12 negative controls rejected.')
    print('Static configuration only. Device support, samples and symbol resolution remain unverified.')


if __name__ == '__main__':
    main()
