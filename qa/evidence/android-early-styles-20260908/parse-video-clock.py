#!/usr/bin/env python3
"""Read Android screenrecord Winscope v2 metadata; never modify the recording."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import struct
import subprocess


def parse(video):
    raw = video.read_bytes()
    magic = b"#VV1NSC0PET1ME2#"
    if raw.count(magic) != 1:
        raise ValueError("Expected exactly one Winscope v2 metadata block")
    at = raw.index(magic)
    pos = at + len(magic)
    version, offset, count = struct.unpack_from("<IqI", raw, pos)
    if version != 2:
        raise ValueError("Unsupported metadata version")
    timestamps = struct.unpack_from("<" + "q" * count, raw, pos + 16)
    probe = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_frames",
        "-show_entries", "frame=best_effort_timestamp,best_effort_timestamp_time",
        "-of", "json", str(video),
    ]))
    frames = probe["frames"]
    if count != len(frames) or count < 1:
        raise ValueError("Embedded and decoded video frame counts disagree")
    if any(b <= a for a, b in zip(timestamps, timestamps[1:])):
        raise ValueError("Embedded frame timestamps are not increasing")
    deltas = [abs((t - timestamps[0]) / 1e9
                  - float(f["best_effort_timestamp_time"]))
              for t, f in zip(timestamps, frames)]
    if max(deltas) > 1 / 90000:
        raise ValueError("Embedded timestamps disagree with MP4 presentation times")
    mapped = []
    for i, (t, f) in enumerate(zip(timestamps, frames)):
        mapped.append({
            "frame_index_zero_based": i,
            "pts_90khz": f["best_effort_timestamp"],
            "pts_seconds": f["best_effort_timestamp_time"],
            "elapsed_ns": t,
            "utc_from_embedded_offset": datetime.datetime.fromtimestamp(
                (t + offset) / 1e9, datetime.timezone.utc).isoformat(timespec="microseconds"),
        })
    return {
        "video": str(video.resolve()),
        "video_sha256": hashlib.sha256(raw).hexdigest(),
        "magic": magic.decode(), "byte_offset": at, "version": version,
        "real_to_elapsed_offset_ns": offset, "frame_count": count,
        "max_pts_vs_timestamp_delta_seconds": max(deltas), "frames": mapped,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    args = parser.parse_args()
    print(json.dumps(parse(args.video), indent=2))
