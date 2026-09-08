-- Read-only replay. Identities, origins and windows belong to the loaded trace.
SELECT 'bounds' section,start_ts,end_ts FROM trace_bounds;
SELECT 'metadata' section,name,str_value,int_value FROM metadata
WHERE name IN ('tracing_service_version','android_sdk_version');
SELECT 'stats' section,name,idx,severity,value,source FROM stats
WHERE value!=0 ORDER BY severity,name,idx;
SELECT 'clock' section,m.snapshot_id,m.clock_value mono_ns,b.clock_value boot_ns,
 m.clock_value-b.clock_value mono_minus_boot_ns
FROM clock_snapshot m JOIN clock_snapshot b
 ON m.snapshot_id=b.snapshot_id AND m.machine_id IS b.machine_id
WHERE m.clock_name='MONOTONIC' AND b.clock_name='BOOTTIME'
ORDER BY m.snapshot_id;
CREATE PERFETTO TABLE launches AS
SELECT l.ts native_ts,t.upid,p.pid,p.name process_name
FROM android_logs l JOIN thread t USING(utid) JOIN process p USING(upid)
WHERE l.tag='RobysHandoff' AND l.msg='NATIVE_SURFACE';
SELECT 'launches' section,* FROM launches ORDER BY native_ts;
CREATE PERFETTO TABLE launch AS SELECT * FROM launches
WHERE (SELECT COUNT(*) FROM launches)=1;
CREATE PERFETTO TABLE marks AS
SELECT n.upid,n.pid,n.native_ts,
 MIN(CASE WHEN l.msg='WEB_COMMITTED' THEN l.ts END) commit_ts,
 MIN(CASE WHEN l.msg='WEB_READY' THEN l.ts END) ready_ts,
 MIN(CASE WHEN l.msg='WEB_READY_TIMEOUT' THEN l.ts END) fallback_ts,
 MIN(CASE WHEN l.msg='VISUAL_STATE_CONFIRMED' THEN l.ts END) visual_ts,
 MIN(CASE WHEN l.msg='HANDOFF_COMPLETE' THEN l.ts END) complete_ts,
 MIN(CASE WHEN l.msg IN ('VISUAL_STATE_TIMEOUT','LOAD_COMMIT_TIMEOUT',
 'MAIN_FRAME_ERROR','SSL_ERROR') THEN l.ts END) failure_ts,
 MIN(CASE WHEN l.msg IN ('HANDOFF_COMPLETE','VISUAL_STATE_TIMEOUT',
 'LOAD_COMMIT_TIMEOUT','MAIN_FRAME_ERROR','SSL_ERROR') THEN l.ts END) outcome_ts
FROM launch n JOIN thread t USING(upid)
LEFT JOIN android_logs l ON l.utid=t.utid AND l.tag='RobysHandoff'
AND l.ts>=n.native_ts GROUP BY n.upid,n.pid,n.native_ts;
SELECT 'marks' section,* FROM marks;
SELECT 'handoff' section,l.ts,l.msg,(l.ts-n.native_ts)/1e6 since_native_ms,
 (l.ts-n.commit_ts)/1e6 since_commit_ms
FROM android_logs l JOIN thread t USING(utid) JOIN marks n USING(upid)
WHERE l.tag='RobysHandoff' AND l.ts>=n.native_ts ORDER BY l.ts;
SELECT 'delivery' section,l.ts,l.msg,(l.ts-n.native_ts)/1e6 since_native_ms
FROM android_logs l JOIN thread t USING(utid) JOIN marks n USING(upid)
WHERE l.tag='RobysPinned' AND l.ts>=n.native_ts ORDER BY l.ts;
CREATE PERFETTO TABLE selected_threads AS
SELECT t.* FROM thread t JOIN launch l USING(upid)
WHERE t.is_main_thread=1 OR t.name='RenderThread' OR t.name GLOB 'Chrome_InProcG*';
SELECT 'threads' section,utid,tid,upid,name,is_main_thread FROM selected_threads;
CREATE PERFETTO TABLE windows AS
SELECT upid,'before_outcome' label,native_ts start_ns,outcome_ts end_ns
FROM marks WHERE outcome_ts>native_ts
UNION ALL
SELECT upid,'after_completion_10s',complete_ts,complete_ts+10000000000
FROM marks WHERE complete_ts IS NOT NULL
UNION ALL
SELECT upid,'after_failure_10s_observation_only',failure_ts,failure_ts+10000000000
FROM marks WHERE complete_ts IS NULL AND failure_ts IS NOT NULL;
SELECT 'coverage' section,w.*,b.start_ts trace_start_ns,b.end_ts trace_end_ns,
 b.start_ts<=w.start_ns AND b.end_ts>=w.end_ns coverage_ok
FROM windows w CROSS JOIN trace_bounds b;
CREATE PERFETTO TABLE waits AS
SELECT s.id,s.parent_id,s.ts,s.dur,t.utid,t.tid,t.upid,t.name thread_name,s.name
FROM slice s JOIN thread_track tt ON tt.id=s.track_id
JOIN selected_threads t USING(utid)
WHERE (s.name='WebViewFunctor::drawGl' AND t.name='RenderThread')
OR (s.name='postAndWait' AND t.is_main_thread=1);
SELECT 'wait_availability' section,w.label,t.tid,t.name thread_name,
 COUNT(s.id) overlapping_count,SUM(s.dur=-1) unfinished_count,
 MAX(s.dur) longest_overlapping_full_ns
FROM windows w JOIN selected_threads t ON t.upid=w.upid
LEFT JOIN waits s ON s.utid=t.utid AND s.ts<w.end_ns
 AND (s.dur=-1 OR s.ts+s.dur>w.start_ns)
GROUP BY w.label,t.utid;
SELECT 'long_waits' section,w.label,s.*,
 MAX(s.ts,w.start_ns) clipped_start_ns,MIN(s.ts+s.dur,w.end_ns) clipped_end_ns,
 s.ts>=w.start_ns AND s.ts+s.dur<=w.end_ns fully_inside
FROM waits s JOIN windows w ON w.upid=s.upid
WHERE s.dur>50000000 AND s.ts<w.end_ns AND s.ts+s.dur>w.start_ns
ORDER BY s.ts,w.label;
SELECT 'unfinished_waits' section,w.label,s.*
FROM waits s JOIN windows w ON w.upid=s.upid
WHERE s.dur=-1 AND s.ts<w.end_ns ORDER BY s.ts;
SELECT 'thread_window_states' section,w.label,t.utid,t.tid,t.name,st.state,
 SUM(MIN(st.ts+st.dur,w.end_ns)-MAX(st.ts,w.start_ns)) overlap_ns
FROM windows w JOIN selected_threads t ON t.upid=w.upid
JOIN thread_state st ON st.utid=t.utid
WHERE st.dur>0 AND st.ts<w.end_ns AND st.ts+st.dur>w.start_ns
GROUP BY w.label,t.utid,st.state ORDER BY w.label,t.utid,st.state;
CREATE PERFETTO TABLE long_draws AS
SELECT DISTINCT s.* FROM waits s JOIN windows w ON w.upid=s.upid
WHERE s.name='WebViewFunctor::drawGl' AND s.dur>50000000
AND s.ts<w.end_ns AND s.ts+s.dur>w.start_ns;
SELECT 'draw_states' section,d.id draw_id,t.utid,t.tid,t.name,st.state,
 SUM(MIN(st.ts+st.dur,d.ts+d.dur)-MAX(st.ts,d.ts)) overlap_ns
FROM long_draws d JOIN selected_threads t ON t.upid=d.upid
JOIN thread_state st ON st.utid=t.utid
WHERE st.dur>0 AND st.ts<d.ts+d.dur AND st.ts+st.dur>d.ts
GROUP BY d.id,t.utid,st.state ORDER BY d.ts,t.utid,st.state;
SELECT 'profile_totals' section,COUNT(*) samples,
 SUM(s.callsite_id IS NULL) missing_callsite,
 SUM(s.unwind_error IS NOT NULL) unwind_errors,
 SUM(t.upid=l.upid) app_samples,
 SUM(t.upid IS NULL OR t.upid!=l.upid) non_app_or_unresolved_samples
FROM perf_sample s LEFT JOIN thread t USING(utid) CROSS JOIN launch l;
SELECT 'gpu_samples' section,s.id,s.ts,s.utid,s.callsite_id,s.unwind_error
FROM perf_sample s JOIN selected_threads t USING(utid)
WHERE t.name GLOB 'Chrome_InProcG*' ORDER BY s.ts,s.id;
SELECT 'leaf_mappings' section,t.tid,t.name thread_name,m.name mapping,m.build_id,
 f.name leaf_name,COUNT(*) samples
FROM perf_sample s JOIN selected_threads t USING(utid)
LEFT JOIN stack_profile_callsite c ON c.id=s.callsite_id
LEFT JOIN stack_profile_frame f ON f.id=c.frame_id
LEFT JOIN stack_profile_mapping m ON m.id=f.mapping
GROUP BY t.utid,m.id,f.name ORDER BY t.utid,samples DESC;
