package com.robys.coffeehouse;

import android.content.Context;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

// Packaged test content never participates in a release build.
final class LocalWebAssets {
    static void install(Context context) {}
    static WebResourceResponse intercept(Context context, WebResourceRequest request) { return null; }
}
