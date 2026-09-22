package com.robys.coffeehouse;

import android.content.Context;
import android.os.Build;
import android.util.Log;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLConnection;
import java.util.Collections;

// CI-only assets preserve the production HTTPS origin, CSP and trust checks.
// A normal debug build without the generated marker still uses the live site.
final class LocalWebAssets {
    private static final String PREFIX = "/robys-coffee-house-demo/";
    private static volatile boolean enabled;

    static void install(Context context) {
        try (InputStream marker = context.getAssets().open("qa-web/source.json")) {
            enabled = marker.read() != -1;
        } catch (IOException absent) {
            enabled = false;
        }
        if (enabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
                @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                    return intercept(context, request);
                }
            });
        }
    }

    static WebResourceResponse intercept(Context context, WebResourceRequest request) {
        if (!enabled || !"https".equals(request.getUrl().getScheme())
                || !"safal207.github.io".equals(request.getUrl().getHost())) return null;
        String path = request.getUrl().getPath();
        if (path == null || !path.startsWith(PREFIX) || !"GET".equals(request.getMethod())) return missing(path);
        path = path.substring(PREFIX.length());
        if (path.endsWith("/") || path.isEmpty()) path += "index.html";
        if (path.contains("\\") || path.indexOf(0) >= 0) return missing(path);
        for (String part : path.split("/")) if (part.equals("..") || part.equals(".")) return missing(path);
        try {
            InputStream data = context.getAssets().open("qa-web/site/" + path);
            String mime = URLConnection.guessContentTypeFromName(path);
            if (path.endsWith(".js") || path.endsWith(".mjs")) mime = "text/javascript";
            else if (path.endsWith(".css")) mime = "text/css";
            else if (path.endsWith(".svg")) mime = "image/svg+xml";
            else if (path.endsWith(".json") || path.endsWith(".webmanifest")) mime = "application/json";
            else if (path.endsWith(".woff2")) mime = "font/woff2";
            else if (path.endsWith(".mp4")) mime = "video/mp4";
            if (mime == null) mime = "application/octet-stream";
            return new WebResourceResponse(mime, null, 200, "OK",
                    Collections.singletonMap("Cache-Control", "no-store"), data);
        } catch (IOException absent) {
            return missing(path);
        }
    }

    private static WebResourceResponse missing(String path) {
        // Fail closed: a missing packaged resource must never fall back to live bytes.
        Log.e("RobysWebAssets", "MISSING " + path);
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
}
