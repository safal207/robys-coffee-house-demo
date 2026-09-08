-- Diagnostic only. Fresh identities and intervals come from this trace.
SELECT 'clock' section, m.snapshot_id, m.clock_value mono_ns,
       b.clock_value boot_ns, m.clock_value-b.clock_value mono_minus_boot_ns
FROM clock_snapshot m JOIN clock_snapshot b
ON m.snapshot_id=b.snapshot_id AND m.machine_id IS b.machine_id
WHERE m.clock_name='MONOTONIC' AND b.clock_name='BOOTTIME'
ORDER BY m.snapshot_id;
SELECT 'stats_all_nonzero' section, name, idx, severity, value, source
FROM stats WHERE value != 0 ORDER BY severity,name,idx;
CREATE PERFETTO TABLE launch AS
SELECT l.ts native_ts,t.upid,p.pid
FROM android_logs l JOIN thread t USING(utid) JOIN process p USING(upid)
WHERE l.tag='RobysHandoff' AND l.msg='NATIVE_SURFACE';
SELECT 'launches' section,* FROM launch;
CREATE PERFETTO TABLE long_draws AS
SELECT s.id,s.ts,s.dur,s.name,t.utid,t.tid,t.upid
FROM slice s JOIN thread_track tr ON tr.id=s.track_id
JOIN thread t USING(utid) JOIN launch l USING(upid)
WHERE s.name='WebViewFunctor::drawGl' AND s.dur>50000000
AND s.ts+s.dur>l.native_ts
AND s.ts < (SELECT MIN(a.ts)+2000000000 FROM android_logs a WHERE a.tag='RobysHandoff' AND a.msg='VISUAL_STATE_TIMEOUT');
SELECT 'long_draw' section,* FROM long_draws ORDER BY ts;
-- Thread-state durations are nonoverlapping only within the same thread.
SELECT 'draw_thread_state' section,d.id draw_id,d.ts draw_start,d.dur draw_dur,
 t.utid,t.tid,t.name thread_name,st.state,
 SUM(MIN(st.ts+st.dur,d.ts+d.dur)-MAX(st.ts,d.ts)) overlap_ns
FROM long_draws d JOIN thread t ON t.upid=d.upid
JOIN thread_state st ON st.utid=t.utid
WHERE (t.is_main_thread=1 OR t.name IN ('RenderThread','Chrome_InProcGp'))
AND st.dur>0 AND st.ts<d.ts+d.dur AND st.ts+st.dur>d.ts
GROUP BY d.id,t.utid,st.state ORDER BY d.ts,t.utid,st.state;
SELECT 'draw_app_samples' section,d.id draw_id,t.utid,t.tid,t.name thread_name,
COUNT(*) samples,SUM(p.callsite_id IS NULL) missing_callsite,
SUM(p.unwind_error IS NOT NULL) unwind_errors
FROM long_draws d JOIN thread t ON t.upid=d.upid
JOIN perf_sample p ON p.utid=t.utid
WHERE p.ts>=d.ts AND p.ts<d.ts+d.dur
GROUP BY d.id,t.utid ORDER BY d.ts,t.utid;
SELECT 'perf_unwind_errors' section,unwind_error,COUNT(*) samples
FROM perf_sample GROUP BY unwind_error;
SELECT 'perf_leaf_mappings' section,p.pid,t.name thread_name,mp.name mapping,
mp.build_id,fr.name leaf_name,COUNT(*) samples
FROM perf_sample ps JOIN thread t USING(utid) JOIN process p USING(upid)
LEFT JOIN stack_profile_callsite c ON c.id=ps.callsite_id
LEFT JOIN stack_profile_frame fr ON fr.id=c.frame_id
LEFT JOIN stack_profile_mapping mp ON mp.id=fr.mapping
GROUP BY p.pid,t.name,mp.name,mp.build_id,fr.name ORDER BY samples DESC;
