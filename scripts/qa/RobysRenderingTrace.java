package com.robys.coffeehouse;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.AtomicFile;
import android.util.Log;
import android.webkit.TracingConfig;
import android.webkit.TracingController;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Diagnostic-only observer, recreated after workspace maintenance. */
final class RobysRenderingTrace {
    private static final String TAG = "RobysRenderingTrace";
    private static final long STOP_AFTER_MS = 35_000L;
    private static RobysRenderingTrace activeOwner;

    private final Context app;
    // Keep observation lifetime separate from product handoff callback cancellation.
    private final Handler stopHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService writer = Executors.newSingleThreadExecutor(
            task -> new Thread(task, "RobysRenderingTraceWriter"));
    private final Runnable stopTimer = () -> stop("timer");
    private TracingController controller;
    private TraceOutput output;
    private boolean ownsSession;
    private boolean stopRequested;
    private boolean stopAccepted;
    private boolean streamClosed;
    private long bytesWritten;
    private int ioErrorCount;
    private String state = "starting";
    private String reason = "starting";
    private long startElapsedNs;
    private long startReturnedElapsedNs;
    private long stopRequestedElapsedNs;
    private long closedElapsedNs;
    private long startUptimeMs;
    private long startWallTimeMs;
    private PackageInfo provider;

    private RobysRenderingTrace(Context context) {
        app = context.getApplicationContext();
    }

    static synchronized RobysRenderingTrace start(Context context) {
        if ((context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0) return null;
        // An activity recreation cannot claim or overwrite an earlier owner's output.
        if (activeOwner != null) {
            Log.w(TAG, "UNAVAILABLE existing observer owns the session");
            return null;
        }
        RobysRenderingTrace observer = new RobysRenderingTrace(context);
        observer.begin();
        return observer;
    }

    private synchronized void begin() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            state = "unavailable";
            reason = "api_unsupported";
            writeStatus();
            writer.shutdown();
            return;
        }
        try {
            controller = TracingController.getInstance();
            provider = WebView.getCurrentWebViewPackage();
            if (controller.isTracing()) {
                state = "unavailable";
                reason = "existing_trace";
                writeStatus();
                writer.shutdown();
                return;
            }
            output = new TraceOutput(new FileOutputStream(new File(app.getFilesDir(), "rendering-trace.json")));
            TracingConfig config = new TracingConfig.Builder()
                    .addCategories(TracingConfig.CATEGORIES_RENDERING | TracingConfig.CATEGORIES_ANDROID_WEBVIEW)
                    .addCategories("disabled-by-default-gpu.service", "disabled-by-default-skia.shaders")
                    .setTracingMode(TracingConfig.RECORD_UNTIL_FULL)
                    .build();
            startUptimeMs = SystemClock.uptimeMillis();
            startWallTimeMs = System.currentTimeMillis();
            startElapsedNs = SystemClock.elapsedRealtimeNanos();
            controller.start(config);
            startReturnedElapsedNs = SystemClock.elapsedRealtimeNanos();
            ownsSession = true;
            activeOwner = this;
            state = "recording";
            reason = "recording";
            writeStatus();
            stopHandler.postDelayed(stopTimer, STOP_AFTER_MS);
        } catch (IOException error) {
            recordIoError(error);
            failStart("start_io_error");
        } catch (RuntimeException error) {
            Log.e(TAG, "start failed", error);
            failStart("start_rejected");
        }
    }

    private void failStart(String failureReason) {
        state = "failed";
        reason = failureReason;
        // start() did not return successfully, so this observer never owns tracing.
        // Closing our file cannot stop a trace owned by another caller.
        if (output != null) {
            try { output.close(); } catch (IOException ignored) { /* Sticky error recorded by close. */ }
        }
        writeStatus();
        writer.shutdown();
    }

    synchronized void stop(String requestedReason) {
        if (!ownsSession || stopRequested) return;
        stopRequested = true;
        stopHandler.removeCallbacks(stopTimer);
        stopRequestedElapsedNs = SystemClock.elapsedRealtimeNanos();
        state = "stopping";
        reason = requestedReason;
        try {
            // onStreamClosed also acquires this monitor. It cannot publish a
            // completion before stopAccepted is known, even with a fast executor.
            stopAccepted = controller.stop(output, writer);
            if (!stopAccepted) {
                state = "failed";
                reason = "stop_rejected";
                closeRejectedOutput();
            }
        } catch (RuntimeException error) {
            state = "failed";
            reason = "stop_exception";
            Log.e(TAG, "stop failed", error);
            closeRejectedOutput();
        }
        writeStatus();
    }

    private void closeRejectedOutput() {
        try { output.close(); } catch (IOException ignored) { /* Sticky error recorded by close. */ }
        writer.shutdown();
    }

    private synchronized void recordIoError(IOException error) {
        ++ioErrorCount;
        Log.e(TAG, "trace I/O failed", error);
    }

    private synchronized void onStreamClosed(boolean successfullyClosed) {
        streamClosed = successfullyClosed;
        closedElapsedNs = SystemClock.elapsedRealtimeNanos();
        if (ownsSession && stopRequested) {
            if (stopAccepted && successfullyClosed && ioErrorCount == 0 && bytesWritten > 0) {
                state = "closed";
            } else {
                state = "failed";
                if (ioErrorCount > 0 || !successfullyClosed) reason = "trace_io_error";
                else if (stopAccepted && bytesWritten == 0) reason = "empty_trace";
            }
        }
        ownsSession = false;
        synchronized (RobysRenderingTrace.class) {
            if (activeOwner == this) activeOwner = null;
        }
        writeStatus();
        writer.shutdown();
    }

    private synchronized void writeStatus() {
        AtomicFile target = new AtomicFile(new File(app.getFilesDir(), "rendering-trace-status.json"));
        FileOutputStream stream = null;
        try {
            JSONObject status = new JSONObject();
            status.put("schema_version", 1);
            status.put("state", state);
            status.put("reason", reason);
            status.put("bytes_written", bytesWritten);
            status.put("io_error_count", ioErrorCount);
            status.put("stop_accepted", stopAccepted);
            status.put("stream_closed", streamClosed);
            status.put("start_elapsed_ns", startElapsedNs);
            status.put("start_returned_elapsed_ns", startReturnedElapsedNs);
            status.put("stop_requested_elapsed_ns", stopRequestedElapsedNs);
            status.put("closed_elapsed_ns", closedElapsedNs);
            status.put("start_uptime_ms", startUptimeMs);
            status.put("start_wall_time_ms", startWallTimeMs);
            status.put("status_elapsed_ns", SystemClock.elapsedRealtimeNanos());
            status.put("status_uptime_ms", SystemClock.uptimeMillis());
            status.put("status_wall_time_ms", System.currentTimeMillis());
            status.put("stop_after_ms", STOP_AFTER_MS);
            status.put("mode", "RECORD_UNTIL_FULL");
            status.put("categories", new JSONArray(new String[]{"CATEGORIES_RENDERING", "CATEGORIES_ANDROID_WEBVIEW",
                    "disabled-by-default-gpu.service", "disabled-by-default-skia.shaders"}));
            JSONObject packageInfo = new JSONObject();
            if (provider != null) {
                packageInfo.put("package_name", provider.packageName);
                packageInfo.put("version_name", provider.versionName);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    packageInfo.put("long_version_code", provider.getLongVersionCode());
                }
            }
            status.put("provider", packageInfo);
            stream = target.startWrite();
            stream.write((status.toString(2) + "\n").getBytes(StandardCharsets.UTF_8));
            target.finishWrite(stream);
        } catch (Exception error) {
            if (stream != null) target.failWrite(stream);
            ++ioErrorCount;
            Log.e(TAG, "status I/O failed", error);
        }
    }

    private final class TraceOutput extends OutputStream {
        private final FileOutputStream stream;
        private boolean closed;

        TraceOutput(FileOutputStream destination) {
            stream = destination;
        }

        @Override
        public void write(int value) throws IOException {
            write(new byte[]{(byte) value}, 0, 1);
        }

        @Override
        public synchronized void write(byte[] bytes, int offset, int length) throws IOException {
            try {
                stream.write(bytes, offset, length);
                synchronized (RobysRenderingTrace.this) { bytesWritten += length; }
            } catch (IOException error) {
                recordIoError(error);
                throw error;
            }
        }

        @Override
        public synchronized void flush() throws IOException {
            try { stream.flush(); }
            catch (IOException error) { recordIoError(error); throw error; }
        }

        @Override
        public synchronized void close() throws IOException {
            if (closed) return;
            closed = true;
            boolean success = false;
            try {
                stream.close();
                success = true;
            } catch (IOException error) {
                recordIoError(error);
                throw error;
            } finally {
                onStreamClosed(success);
            }
        }
    }
}
