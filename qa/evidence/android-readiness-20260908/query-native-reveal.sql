-- Diagnostic only. One cold launch per app process and trace.
-- Never add drawGl to postAndWait: those intervals overlap across threads.
-- Full slice duration and per-window overlap are separate quantities.

SELECT 'trace_bounds' AS section, start_ts, end_ts FROM trace_bounds;
SELECT 'trace_loss_summary' AS section, COUNT(*) AS nonzero_loss_or_error_rows
FROM stats WHERE value != 0 AND severity IN ('error', 'data_loss');
SELECT 'loss_or_error' AS section, name, value, severity, source
FROM stats WHERE value != 0 AND severity IN ('error', 'data_loss');

CREATE PERFETTO TABLE robys_reveal_marks AS
SELECT p.upid, p.pid, p.name AS process_name,
       SUM(CASE WHEN l.msg = 'NATIVE_SURFACE' THEN 1 ELSE 0 END) AS launch_count,
       MIN(CASE WHEN l.msg = 'NATIVE_SURFACE' THEN l.ts END) AS native_ts,
       MIN(CASE WHEN l.msg = 'WEB_COMMITTED' THEN l.ts END) AS commit_ts,
       MIN(CASE WHEN l.msg = 'WEB_READY' THEN l.ts END) AS ready_ts,
       MIN(CASE WHEN l.msg = 'WEB_READY_TIMEOUT' THEN l.ts END) AS fallback_ts,
       MIN(CASE WHEN l.msg = 'VISUAL_STATE_CONFIRMED' THEN l.ts END) AS visual_ts,
       MIN(CASE WHEN l.msg = 'HANDOFF_COMPLETE' THEN l.ts END) AS reveal_ts,
       MIN(CASE WHEN l.msg IN ('VISUAL_STATE_TIMEOUT', 'LOAD_COMMIT_TIMEOUT',
                              'MAIN_FRAME_ERROR', 'SSL_ERROR') THEN l.ts END) AS failure_ts,
       MIN(CASE WHEN l.msg IN ('HANDOFF_COMPLETE', 'VISUAL_STATE_TIMEOUT',
                              'LOAD_COMMIT_TIMEOUT', 'MAIN_FRAME_ERROR',
                              'SSL_ERROR') THEN l.ts END) AS outcome_ts
FROM android_logs l JOIN thread t USING (utid) JOIN process p USING (upid)
WHERE l.tag = 'RobysHandoff'
GROUP BY p.upid;

SELECT 'launch_identity' AS section, * FROM robys_reveal_marks;
-- The native source logs VISUAL_STATE_CONFIRMED just before requesting view
-- visibility and logs HANDOFF_COMPLETE afterward. Neither is proof of an
-- actually displayed first product frame; inspect SF/video evidence separately.
SELECT 'reveal_call_bracket' AS section, pid, visual_ts, reveal_ts,
       ROUND((reveal_ts - visual_ts) / 1e6, 3) AS visual_marker_to_completion_ms
FROM robys_reveal_marks;
SELECT 'handoff_sequence' AS section, p.pid, t.tid, l.ts,
       ROUND((l.ts - m.native_ts) / 1e6, 3) AS since_native_ms, l.msg
FROM android_logs l JOIN thread t USING (utid) JOIN process p USING (upid)
JOIN robys_reveal_marks m USING (upid)
WHERE l.tag = 'RobysHandoff' ORDER BY l.ts;

-- Empty post-reveal window for a failed launch is not zero observed latency.
-- A short trace leaves requested_end_ts intact and coverage_ok false.
CREATE PERFETTO TABLE robys_reveal_windows AS
SELECT upid, 'before_outcome' AS phase, native_ts AS start_ts,
       outcome_ts AS requested_end_ts
FROM robys_reveal_marks WHERE launch_count = 1 AND outcome_ts > native_ts
UNION ALL
SELECT upid, 'after_reveal_10s', reveal_ts, reveal_ts + 10000000000
FROM robys_reveal_marks WHERE launch_count = 1 AND reveal_ts IS NOT NULL;

SELECT 'window_coverage' AS section, m.pid, w.phase, w.start_ts,
       w.requested_end_ts, b.start_ts AS trace_start_ts, b.end_ts AS trace_end_ts,
       ROUND((w.requested_end_ts - w.start_ts) / 1e6, 3) AS requested_ms,
       ROUND(MAX(0, MIN(b.end_ts, w.requested_end_ts) - MAX(b.start_ts, w.start_ts)) / 1e6, 3) AS captured_ms,
       b.start_ts <= w.start_ts AND b.end_ts >= w.requested_end_ts AS coverage_ok
FROM robys_reveal_windows w JOIN robys_reveal_marks m USING (upid)
CROSS JOIN trace_bounds b;

-- thread_state intervals are disjoint for an individual thread. Report each
-- main/RenderThread separately; never combine threads into wall-clock time.
SELECT 'thread_state_coverage' AS section, m.pid, t.tid, t.name AS thread_name,
       w.phase, ROUND((w.requested_end_ts - w.start_ts) / 1e6, 3) AS window_ms,
       ROUND(SUM(MIN(st.ts + st.dur, w.requested_end_ts) - MAX(st.ts, w.start_ts)) / 1e6, 3) AS state_coverage_ms
FROM thread_state st JOIN thread t USING (utid)
JOIN robys_reveal_marks m USING (upid) JOIN robys_reveal_windows w USING (upid)
WHERE (t.is_main_thread = 1 OR t.name = 'RenderThread') AND st.dur > 0
  AND st.ts < w.requested_end_ts AND st.ts + st.dur > w.start_ts
GROUP BY m.pid, t.tid, w.phase;

CREATE PERFETTO TABLE robys_reveal_wait_slices AS
SELECT m.upid, m.pid, t.tid, t.name AS thread_name, s.id, s.parent_id,
       s.ts, s.dur, s.thread_dur, s.name
FROM slice s JOIN thread_track tr ON s.track_id = tr.id
JOIN thread t USING (utid) JOIN robys_reveal_marks m USING (upid)
WHERE (s.name = 'WebViewFunctor::drawGl' AND t.name = 'RenderThread')
   OR (s.name = 'postAndWait' AND t.is_main_thread = 1);

-- An empty known-wait set is not a measurement of zero work. Visibility may
-- move work to different slice names; show both known and all thread slices.
SELECT 'slice_availability' AS section, w.phase, m.pid, t.tid,
       t.name AS thread_name, COUNT(s.id) AS all_overlapping_slice_count,
       SUM(CASE WHEN s.name IN ('WebViewFunctor::drawGl', 'postAndWait') THEN 1 ELSE 0 END) AS known_wait_slice_count,
       ROUND(MAX(s.dur) / 1e6, 3) AS longest_any_overlapping_slice_ms
FROM robys_reveal_windows w JOIN robys_reveal_marks m USING (upid)
JOIN thread t USING (upid) LEFT JOIN thread_track tr USING (utid)
LEFT JOIN slice s ON s.track_id = tr.id AND s.dur >= 0
  AND s.ts < w.requested_end_ts AND s.ts + s.dur > w.start_ts
WHERE t.is_main_thread = 1 OR t.name = 'RenderThread'
GROUP BY w.phase, m.pid, t.tid;

-- Before using aggregate counts, nested_same_family must be zero. No duration
-- sum is produced for slices; crossing slices are excluded from averages.
SELECT 'nested_same_family' AS section, COUNT(*) AS nested_pairs
FROM robys_reveal_wait_slices a JOIN robys_reveal_wait_slices b
ON a.upid = b.upid AND a.tid = b.tid AND a.name = b.name AND a.id != b.id
WHERE a.dur > 0 AND b.dur > 0 AND b.ts >= a.ts AND b.ts + b.dur <= a.ts + a.dur;

SELECT 'wait_summary' AS section, w.phase, s.pid, s.tid, s.thread_name, s.name,
       COUNT(*) AS complete_inside_count,
       ROUND(MAX(s.dur) / 1e6, 3) AS longest_complete_ms,
       ROUND(AVG(s.dur) / 1e6, 3) AS average_complete_ms
FROM robys_reveal_wait_slices s JOIN robys_reveal_windows w USING (upid)
WHERE s.dur >= 0 AND s.ts >= w.start_ts AND s.ts + s.dur <= w.requested_end_ts
GROUP BY w.phase, s.pid, s.tid, s.name;

SELECT 'boundary_or_unfinished_wait' AS section, w.phase, s.pid, s.tid,
       s.thread_name, s.name, s.id, s.parent_id, s.ts, s.dur,
       ROUND((s.ts - m.native_ts) / 1e6, 3) AS start_since_native_ms,
       ROUND(s.dur / 1e6, 3) AS full_duration_ms
FROM robys_reveal_wait_slices s JOIN robys_reveal_windows w USING (upid)
JOIN robys_reveal_marks m USING (upid)
WHERE (s.dur = -1 AND s.ts < w.requested_end_ts)
   OR (s.dur >= 0 AND s.ts < w.requested_end_ts AND s.ts + s.dur > w.start_ts
       AND NOT (s.ts >= w.start_ts AND s.ts + s.dur <= w.requested_end_ts))
ORDER BY s.ts, w.phase;

-- Other long thread work is descriptive, not a new product threshold. Parent
-- and child slices may overlap; retain ids and never total these durations.
SELECT 'other_long_thread_work' AS section, w.phase, m.pid, t.tid,
       t.name AS thread_name, s.name, s.category, s.id, s.parent_id,
       ROUND((s.ts - m.native_ts) / 1e6, 3) AS start_since_native_ms,
       ROUND((s.ts - m.visual_ts) / 1e6, 3) AS start_since_visual_marker_ms,
       ROUND(s.dur / 1e6, 3) AS full_duration_ms,
       s.ts >= w.start_ts AND s.ts + s.dur <= w.requested_end_ts AS fully_inside
FROM slice s JOIN thread_track tr ON s.track_id = tr.id
JOIN thread t USING (utid) JOIN robys_reveal_marks m USING (upid)
JOIN robys_reveal_windows w USING (upid)
WHERE (t.is_main_thread = 1 OR t.name = 'RenderThread')
  AND s.name NOT IN ('WebViewFunctor::drawGl', 'postAndWait')
  AND s.dur > 100000000 AND s.ts < w.requested_end_ts AND s.ts + s.dur > w.start_ts
ORDER BY s.ts, w.phase, s.id;

-- Every wait over50ms intersecting either window; no truncation/hidden totals.
SELECT 'long_wait' AS section, w.phase, s.pid, s.tid, s.thread_name, s.name,
       s.id, s.parent_id, s.ts, s.dur,
       ROUND((s.ts - m.native_ts) / 1e6, 3) AS start_since_native_ms,
       ROUND((s.ts - m.reveal_ts) / 1e6, 3) AS start_since_reveal_ms,
       ROUND(s.dur / 1e6, 3) AS full_duration_ms,
       ROUND(s.thread_dur / 1e6, 3) AS slice_thread_cpu_ms,
       ROUND((MIN(s.ts + s.dur, w.requested_end_ts) - MAX(s.ts, w.start_ts)) / 1e6, 3) AS window_overlap_ms,
       s.ts >= w.start_ts AND s.ts + s.dur <= w.requested_end_ts AS fully_inside
FROM robys_reveal_wait_slices s JOIN robys_reveal_windows w USING (upid)
JOIN robys_reveal_marks m USING (upid)
WHERE s.dur > 50000000 AND s.ts < w.requested_end_ts AND s.ts + s.dur > w.start_ts
ORDER BY s.ts, w.phase;

SELECT 'delivery_timeline' AS section, m.pid,
       ROUND((l.ts - m.native_ts) / 1e6, 3) AS since_native_ms,
       ROUND((l.ts - m.reveal_ts) / 1e6, 3) AS since_reveal_ms, l.msg
FROM android_logs l JOIN thread t USING (utid) JOIN robys_reveal_marks m USING (upid)
WHERE l.tag = 'RobysPinned' AND l.ts >= m.native_ts
  AND l.ts <= COALESCE(m.reveal_ts + 10000000000, m.outcome_ts)
ORDER BY l.ts;
