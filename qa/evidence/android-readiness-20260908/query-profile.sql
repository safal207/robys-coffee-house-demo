SELECT 'trace_bounds' section, start_ts, end_ts FROM trace_bounds;
CREATE PERFETTO TABLE robys_launches AS
SELECT l.id log_id, l.ts native_ts, t.upid, p.pid, p.name process_name, t.utid, t.tid
FROM android_logs l
LEFT JOIN thread t USING (utid)
LEFT JOIN process p USING (upid)
WHERE l.tag = 'RobysHandoff' AND l.msg = 'NATIVE_SURFACE'
ORDER BY l.ts;
SELECT 'launch_inventory' section, * FROM robys_launches;
CREATE PERFETTO TABLE selected_launch AS
SELECT * FROM robys_launches ORDER BY native_ts LIMIT 1;
SELECT 'selected_launch' section, * FROM selected_launch;
CREATE PERFETTO TABLE selected_threads AS
SELECT t.* FROM thread t JOIN selected_launch l USING (upid);
SELECT 'thread_inventory' section, t.utid, t.tid, t.upid, t.name,
       t.is_main_thread, t.start_ts, t.end_ts
FROM selected_threads t ORDER BY t.tid;
CREATE PERFETTO TABLE selected_gpu AS
SELECT t.* FROM selected_threads t WHERE t.name GLOB 'Chrome_InProcG*';
SELECT 'gpu_identity' section, utid, tid, upid, name FROM selected_gpu;

SELECT 'handoff_nodes' section, l.id, l.ts, t.upid, p.pid, t.utid, t.tid, l.tag, l.msg,
       l.ts - s.native_ts since_native_ns
FROM android_logs l
LEFT JOIN thread t USING (utid)
LEFT JOIN process p USING (upid)
CROSS JOIN selected_launch s
WHERE l.tag = 'RobysHandoff'
ORDER BY l.ts, l.id;
SELECT 'robys_log_nodes' section, l.id, l.ts, t.upid, p.pid, t.utid, t.tid, l.tag, l.msg,
       l.ts - s.native_ts since_native_ns
FROM android_logs l
JOIN thread t USING (utid)
JOIN process p USING (upid)
JOIN selected_launch s USING (upid)
WHERE l.tag GLOB 'Robys*' AND l.ts >= s.native_ts
ORDER BY l.ts, l.id;
CREATE PERFETTO TABLE selected_outcome AS
SELECT s.upid, s.native_ts,
       MIN(CASE WHEN l.msg = 'HANDOFF_COMPLETE' THEN l.ts END) completion_ts,
       MIN(CASE WHEN l.msg IN ('HANDOFF_COMPLETE', 'VISUAL_STATE_TIMEOUT',
         'LOAD_COMMIT_TIMEOUT', 'MAIN_FRAME_ERROR', 'SSL_ERROR') THEN l.ts END) outcome_ts
FROM selected_launch s
LEFT JOIN thread t USING (upid)
LEFT JOIN android_logs l ON l.utid = t.utid AND l.tag = 'RobysHandoff'
  AND l.ts >= s.native_ts
GROUP BY s.upid, s.native_ts;
SELECT 'selected_outcome' section, * FROM selected_outcome;
CREATE PERFETTO TABLE selected_windows AS
SELECT 'before_outcome' label, native_ts start_ns, outcome_ts end_ns
FROM selected_outcome WHERE outcome_ts > native_ts
UNION ALL
SELECT 'after_completion_10s', completion_ts, completion_ts + 10000000000
FROM selected_outcome WHERE completion_ts IS NOT NULL;
SELECT 'window_coverage' section, w.label, w.start_ns, w.end_ns,
       b.start_ts trace_start_ns, b.end_ts trace_end_ns,
       b.start_ts <= w.start_ns AND b.end_ts >= w.end_ns coverage_ok
FROM selected_windows w CROSS JOIN trace_bounds b;

SELECT 'thread_window_coverage' section,w.label,t.utid,t.tid,t.name thread_name,
       MAX(w.start_ns,COALESCE(t.start_ts,w.start_ns)) requested_start_ns,
       MIN(w.end_ns,COALESCE(t.end_ts,w.end_ns)) requested_end_ns,
       COALESCE(SUM(MIN(st.ts+st.dur,w.end_ns)-MAX(st.ts,w.start_ns)),0) state_coverage_ns
FROM selected_windows w JOIN selected_threads t
  ON (t.is_main_thread=1 OR t.name='RenderThread' OR t.name GLOB 'Chrome_InProcG*')
  AND COALESCE(t.start_ts,w.start_ns)<w.end_ns
  AND COALESCE(t.end_ts,w.end_ns)>w.start_ns
LEFT JOIN thread_state st ON st.utid=t.utid AND st.dur>0
  AND st.ts<w.end_ns AND st.ts+st.dur>w.start_ns
GROUP BY w.label,t.utid,t.tid,t.name,w.start_ns,w.end_ns,t.start_ts,t.end_ts;

CREATE PERFETTO TABLE selected_draw_wait AS
SELECT sl.id, sl.parent_id, sl.track_id, t.upid, t.utid, t.tid, t.name thread_name,
       sl.name, sl.ts, sl.dur, sl.thread_dur, sl.category
FROM slice sl JOIN thread_track tr ON tr.id = sl.track_id
JOIN selected_threads t USING (utid)
JOIN selected_launch n USING (upid)
WHERE (sl.name = 'WebViewFunctor::drawGl' OR sl.name GLOB 'DrawFrame*'
       OR sl.name GLOB '*wait*' OR sl.name GLOB '*Wait*')
  AND (sl.ts >= n.native_ts OR sl.dur < 0 OR sl.ts + sl.dur > n.native_ts);
SELECT 'draw_wait_nodes' section, * FROM selected_draw_wait ORDER BY ts, id;
SELECT 'draw_wait_window_nodes' section, w.label, d.id, d.utid, d.tid, d.thread_name,
       d.name, d.ts start_ns, d.dur,
       CASE WHEN d.dur >= 0 THEN MIN(d.ts + d.dur, w.end_ns)-MAX(d.ts, w.start_ns) END overlap_ns
FROM selected_draw_wait d JOIN selected_windows w
  ON d.ts < w.end_ns AND (d.dur < 0 OR d.ts+d.dur > w.start_ns)
ORDER BY d.ts, d.id, w.label;

SELECT 'profile_inventory' section, t.upid, p.pid, p.name process_name,
       s.utid, t.tid, t.name thread_name, s.perf_session_id,
       COUNT(*) samples, SUM(s.callsite_id IS NULL) missing_callsite,
       SUM(s.unwind_error IS NOT NULL) unwind_errors,
       MIN(s.ts) first_sample_ns, MAX(s.ts) last_sample_ns
FROM perf_sample s
LEFT JOIN thread t USING (utid)
LEFT JOIN process p USING (upid)
GROUP BY t.upid,p.pid,p.name,s.utid,t.tid,t.name,s.perf_session_id
ORDER BY t.upid,s.utid,s.perf_session_id;
SELECT 'profile_samples' section, s.id, s.ts, s.cpu, s.cpu_mode, s.perf_session_id,
       s.utid, t.tid, t.upid, p.pid, p.name process_name, t.name thread_name,
       s.callsite_id, s.unwind_error,
       CASE WHEN t.upid IS NULL OR p.pid IS NULL THEN 'UNRESOLVED_IDENTITY'
            WHEN t.upid != n.upid THEN 'OUTSIDE_SELECTED_PROCESS'
            WHEN t.upid = n.upid THEN 'SELECTED_PROCESS'
            ELSE 'UNRESOLVED_SELECTION' END process_scope
FROM perf_sample s
LEFT JOIN thread t USING (utid)
LEFT JOIN process p USING (upid)
LEFT JOIN selected_launch n ON 1=1
ORDER BY s.ts,s.id;
SELECT 'profile_stats' section, name, idx, severity, value, source
FROM stats
WHERE value != 0 AND (severity IN ('error','data_loss','notice')
                      OR name GLOB '*perf*' OR name GLOB '*stack*'
                      OR name = 'ftrace_setup_errors')
ORDER BY severity,name,idx;

CREATE PERFETTO TABLE selected_gpu_samples AS
SELECT s.* FROM perf_sample s JOIN selected_gpu g USING (utid);
SELECT 'gpu_samples' section, s.id, s.ts, s.utid, s.cpu, s.cpu_mode,
       s.callsite_id,s.unwind_error,s.perf_session_id
FROM selected_gpu_samples s ORDER BY ts,id;
SELECT 'gpu_window_samples' section, w.label,w.start_ns,w.end_ns,
       COUNT(s.id) samples,SUM(s.callsite_id IS NOT NULL) with_callsite,
       SUM(s.unwind_error IS NOT NULL) unwind_errors,
       MIN(s.ts) first_sample_ns,MAX(s.ts) last_sample_ns
FROM selected_windows w LEFT JOIN selected_gpu_samples s
  ON s.ts >= w.start_ns AND s.ts < w.end_ns
GROUP BY w.label,w.start_ns,w.end_ns;
SELECT 'gpu_draw_wait_samples' section, d.id,d.name,d.ts start_ns,d.dur,
       COUNT(s.id) samples,SUM(s.callsite_id IS NOT NULL) with_callsite,
       SUM(s.unwind_error IS NOT NULL) unwind_errors
FROM selected_draw_wait d LEFT JOIN selected_gpu_samples s
  ON d.dur >= 0 AND s.ts >= d.ts AND s.ts < d.ts+d.dur
GROUP BY d.id,d.name,d.ts,d.dur ORDER BY d.ts,d.id;

CREATE PERFETTO TABLE selected_gpu_frame_nodes AS
WITH RECURSIVE frames(sample_id,sample_ts,utid,callsite_id,walk_depth) AS (
  SELECT s.id,s.ts,s.utid,s.callsite_id,0
  FROM selected_gpu_samples s WHERE s.callsite_id IS NOT NULL
  UNION ALL
  SELECT f.sample_id,f.sample_ts,f.utid,c.parent_id,f.walk_depth+1
  FROM frames f JOIN stack_profile_callsite c ON c.id=f.callsite_id
  WHERE c.parent_id IS NOT NULL AND f.walk_depth < 255
)
SELECT f.sample_id,f.sample_ts,f.utid,f.callsite_id,f.walk_depth,
       c.id actual_callsite_id,c.parent_id,c.depth,c.frame_id,
       frame.name frame_name,frame.rel_pc,frame.symbol_set_id,
       mapping.id mapping_id,mapping.name mapping_name,mapping.build_id
FROM frames f
LEFT JOIN stack_profile_callsite c ON c.id=f.callsite_id
LEFT JOIN stack_profile_frame frame ON frame.id=c.frame_id
LEFT JOIN stack_profile_mapping mapping ON mapping.id=frame.mapping;
SELECT 'gpu_frame_nodes' section,* FROM selected_gpu_frame_nodes
ORDER BY sample_ts,sample_id,walk_depth;
SELECT 'gpu_frame_symbols' section,f.sample_id,f.callsite_id,f.symbol_set_id,
       s.name,s.source_file,s.line_number,s.inlined
FROM selected_gpu_frame_nodes f JOIN stack_profile_symbol s USING(symbol_set_id)
ORDER BY f.sample_id,f.callsite_id,s.id;
