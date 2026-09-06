package com.robys.coffeehouse;

import android.content.Context;
import android.net.Uri;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;

// Diagnostic APK only. Injected into a temporary source copy by the preparer;
// never part of android-native's source sets or a release build.
final class PinnedWebFixture {
    private static final String TAG = "RobysPinned";
    private static final String PREFIX = "/robys-coffee-house-demo/";
    private static JSONObject manifest;

    private static byte[] read(InputStream input) throws Exception {
        try (InputStream stream = input; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            for (int length; (length = stream.read(buffer)) != -1;) out.write(buffer, 0, length);
            return out.toByteArray();
        }
    }

    private static synchronized JSONObject manifest(Context context) throws Exception {
        if (manifest == null) manifest = new JSONObject(new String(
                read(context.getAssets().open("pinned-manifest.json")), "UTF-8"));
        return manifest;
    }

    private static WebResourceResponse error(String state, String detail, int code) {
        Log.d(TAG, state + " " + detail);
        return new WebResourceResponse("text/plain", "UTF-8", code, "Fixture response",
                new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }

    static WebResourceResponse serve(Context context, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (!"https".equals(uri.getScheme()) || !"safal207.github.io".equals(uri.getHost())
                || (uri.getPort() != -1 && uri.getPort() != 443)) {
            return error("EXTERNAL_BLOCKED", uri.toString(), 503);
        }
        try {
            String pathname = uri.getPath();
            if (pathname == null || !pathname.startsWith(PREFIX) || pathname.contains(".."))
                return error("MISSING", uri.toString(), 404);
            String path = pathname.substring(PREFIX.length());
            if (path.isEmpty() || path.endsWith("/")) path += "index.html";
            JSONObject files = manifest(context).getJSONObject("files");
            if (!files.has(path)) return error("MISSING", path, 404);
            if (!"GET".equals(request.getMethod())) return error("METHOD", path, 405);
            JSONObject entry = files.getJSONObject(path);
            byte[] bytes = read(context.getAssets().open("pinned-web/" + entry.getString("asset")));
            StringBuilder digest = new StringBuilder();
            for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes))
                digest.append(String.format(java.util.Locale.ROOT, "%02x", value & 0xff));
            if (!digest.toString().equals(entry.getString("sha256")))
                return error("HASH_MISMATCH", path, 500);

            Map<String, String> headers = new HashMap<>();
            headers.put("Accept-Ranges", "bytes");
            headers.put("Cache-Control", "no-store");
            String range = null;
            for (Map.Entry<String, String> header : request.getRequestHeaders().entrySet())
                if ("Range".equalsIgnoreCase(header.getKey())) range = header.getValue();
            int start = 0, end = bytes.length - 1, status = 200;
            if (range != null) {
                Matcher match = Pattern.compile("bytes=(\\d*)-(\\d*)").matcher(range);
                if (!match.matches() || (match.group(1).isEmpty() && match.group(2).isEmpty()))
                    return error("RANGE_ERROR", path, 416);
                if (match.group(1).isEmpty()) start = Math.max(0, bytes.length - Integer.parseInt(match.group(2)));
                else start = Integer.parseInt(match.group(1));
                if (!match.group(1).isEmpty() && !match.group(2).isEmpty())
                    end = Math.min(end, Integer.parseInt(match.group(2)));
                if (start > end || start >= bytes.length) return error("RANGE_ERROR", path, 416);
                headers.put("Content-Range", "bytes " + start + "-" + end + "/" + bytes.length);
                status = 206;
            }
            int length = Math.max(0, end - start + 1);
            headers.put("Content-Length", Integer.toString(length));
            Log.d(TAG, "SERVED " + path + " sha256=" + digest + " status=" + status);
            return new WebResourceResponse(entry.getString("mime"), null, status,
                    status == 206 ? "Partial Content" : "OK", headers,
                    new ByteArrayInputStream(bytes, start, length));
        } catch (Exception error) {
            return error("ERROR", error.toString(), 500);
        }
    }
}
