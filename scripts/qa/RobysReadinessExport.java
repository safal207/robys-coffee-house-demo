package com.robys.coffeehouse;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.AtomicFile;
import android.util.Log;
import android.webkit.WebView;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/** Diagnostic-only, one delayed export; never participates in product readiness. */
final class RobysReadinessExport {
    private static final long EXPORT_AFTER_MS = 55_000L;
    private static boolean ownerClaimed;
    private final Context app;
    private final WebView view;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable timer = this::export;
    private final long startElapsedNs = SystemClock.elapsedRealtimeNanos();
    private final long startUptimeMs = SystemClock.uptimeMillis();
    private final long startWallMs = System.currentTimeMillis();
    private long requestElapsedNs;
    private long requestUptimeMs;
    private long requestWallMs;
    private long callbackElapsedNs;
    private boolean finished;

    private RobysReadinessExport(Context context, WebView webView) {
        app = context.getApplicationContext();
        view = webView;
    }

    static synchronized RobysReadinessExport start(Context context, WebView view) {
        if ((context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0 || ownerClaimed) return null;
        try {
            RobysReadinessExport observer = new RobysReadinessExport(context, view);
            // Handler deadlines use integer uptime; one extra millisecond keeps
            // the high-resolution elapsed interval at least EXPORT_AFTER_MS.
            if (!observer.handler.postDelayed(observer.timer, EXPORT_AFTER_MS + 1L)) return null;
            ownerClaimed = true; // A later activity cannot overwrite this launch's output.
            return observer;
        } catch (RuntimeException error) {
            Log.e("RobysReadinessExport", "Unable to schedule observer", error);
            return null;
        }
    }

    private void export() {
        if (finished) return;
        requestElapsedNs = SystemClock.elapsedRealtimeNanos();
        requestUptimeMs = SystemClock.uptimeMillis();
        requestWallMs = System.currentTimeMillis();
        try {
            view.evaluateJavascript("JSON.stringify({snapshot:typeof window.__robysAndroidReadinessSnapshot==='function'?window.__robysAndroidReadinessSnapshot():null,href:location.href,now_ms:performance.now(),time_origin_ms:performance.timeOrigin})", value -> {
                if (finished) return;
                callbackElapsedNs = SystemClock.elapsedRealtimeNanos();
                try {
                    Object decoded = new JSONTokener(value).nextValue();
                    JSONObject payload = decoded instanceof String ? new JSONObject((String) decoded) : null;
                    finish(payload != null && !payload.isNull("snapshot") ? "captured" : "missing", payload, null);
                } catch (Exception error) {
                    finish("error", null, error.getClass().getSimpleName());
                }
            });
        } catch (RuntimeException error) {
            finish("error", null, error.getClass().getSimpleName());
        }
    }

    void destroy() {
        handler.removeCallbacks(timer);
        if (!finished) finish("destroyed", null, null);
    }

    private void finish(String state, JSONObject payload, String error) {
        if (finished) return;
        finished = true;
        AtomicFile target = new AtomicFile(new File(app.getFilesDir(), "readiness-observation.json"));
        FileOutputStream stream = null;
        try {
            JSONObject record = new JSONObject();
            record.put("schema", "robys.android.readiness-export.v1");
            record.put("state", state);
            record.put("export_after_ms", EXPORT_AFTER_MS);
            record.put("start_elapsed_ns", startElapsedNs);
            record.put("start_uptime_ms", startUptimeMs);
            record.put("start_wall_ms", startWallMs);
            record.put("request_elapsed_ns", requestElapsedNs);
            record.put("request_uptime_ms", requestUptimeMs);
            record.put("request_wall_ms", requestWallMs);
            record.put("callback_elapsed_ns", callbackElapsedNs);
            record.put("written_elapsed_ns", SystemClock.elapsedRealtimeNanos());
            record.put("written_uptime_ms", SystemClock.uptimeMillis());
            record.put("written_wall_ms", System.currentTimeMillis());
            record.put("payload", payload == null ? JSONObject.NULL : payload);
            record.put("error", error == null ? JSONObject.NULL : error);
            stream = target.startWrite();
            stream.write((record.toString(2) + "\n").getBytes(StandardCharsets.UTF_8));
            target.finishWrite(stream);
        } catch (Exception failure) {
            if (stream != null) target.failWrite(stream);
            Log.e("RobysReadinessExport", "Unable to persist observation", failure);
        }
    }
}
