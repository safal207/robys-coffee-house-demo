"""Minimal JVM platform doubles; no handoff decisions are implemented here."""

SOURCES = {
    "android/content/Context.java": r'''
package android.content;
public class Context {
  public android.content.pm.ApplicationInfo getApplicationInfo() { return new android.content.pm.ApplicationInfo(); }
  public int getColor(int value) { return value; }
  public android.content.res.Resources getResources() { return new android.content.res.Resources(); }
  public void startActivity(Intent intent) {}
}
''',
    "android/content/res/Resources.java": r'''
package android.content.res;
public class Resources {
  public static class Metrics { public float density = 1; }
  public Metrics getDisplayMetrics() { return new Metrics(); }
}
''',
    "android/content/ActivityNotFoundException.java": "package android.content; public class ActivityNotFoundException extends RuntimeException {}",
    "android/content/Intent.java": r'''
package android.content;
public class Intent {
  public static final String ACTION_VIEW = "view", CATEGORY_BROWSABLE = "browsable";
  public Intent(String action, android.net.Uri uri) {}
  public void addCategory(String category) {}
}
''',
    "android/content/pm/ApplicationInfo.java": "package android.content.pm; public class ApplicationInfo { public static final int FLAG_DEBUGGABLE = 2; public int flags = FLAG_DEBUGGABLE; }",
    "android/graphics/Color.java": r'''
package android.graphics;
public class Color {
  public static final int WHITE = -1, TRANSPARENT = 0;
  public static int rgb(int r, int g, int b) { return argb(255, r, g, b); }
  public static int argb(int a, int r, int g, int b) { return a << 24 | r << 16 | g << 8 | b; }
}
''',
    "android/net/Uri.java": r'''
package android.net;
public class Uri {
  private final java.net.URI value;
  private Uri(String text) { value = java.net.URI.create(text); }
  public static Uri parse(String text) { return new Uri(text); }
  public String getScheme() { return value.getScheme(); }
  public String getHost() { return value.getHost(); }
  public String getPath() { return value.getPath(); }
  public String getQueryParameter(String key) {
    String query = value.getRawQuery();
    if (query == null) return null;
    for (String part : query.split("&")) {
      String[] pair = part.split("=", 2);
      if (java.net.URLDecoder.decode(pair[0], java.nio.charset.StandardCharsets.UTF_8).equals(key))
        return pair.length == 2 ? java.net.URLDecoder.decode(pair[1], java.nio.charset.StandardCharsets.UTF_8) : "";
    }
    return null;
  }
  public String toString() { return value.toString(); }
}
''',
    "android/net/http/SslError.java": "package android.net.http; public class SslError { private final String url; public SslError(String value) { url = value; } public String getUrl() { return url; } }",
    "android/os/Build.java": "package android.os; public class Build { public static class VERSION { public static int SDK_INT = 36; } public static class VERSION_CODES { public static final int O = 26, R = 30; } }",
    "android/os/Bundle.java": "package android.os; public class Bundle {}",
    "android/os/Looper.java": "package android.os; public class Looper { public static Looper getMainLooper() { return new Looper(); } }",
    "android/os/SystemClock.java": "package android.os; public class SystemClock { public static long now; public static long uptimeMillis() { return now; } }",
    "android/os/Handler.java": r'''
package android.os;
public class Handler {
  public static Handler last;
  public static class Pending {
    public final Runnable action; public final long at;
    Pending(Runnable action, long at) { this.action = action; this.at = at; }
  }
  public final java.util.List<Pending> pending = new java.util.ArrayList<>();
  public Handler(Looper looper) { last = this; }
  public boolean postDelayed(Runnable action, long delay) { pending.add(new Pending(action, SystemClock.now + delay)); return true; }
  public void removeCallbacks(Runnable action) { pending.removeIf(item -> item.action == action); }
  public void removeCallbacksAndMessages(Object token) { pending.clear(); }
  public void runDue() {
    for (int count = 0; count < 100; count++) {
      Pending next = pending.stream().filter(item -> item.at <= SystemClock.now)
        .min(java.util.Comparator.comparingLong(item -> item.at)).orElse(null);
      if (next == null) return;
      pending.remove(next); next.action.run();
    }
    throw new AssertionError("Unbounded immediate callback loop");
  }
}
''',
    "android/util/Log.java": r'''
package android.util;
public class Log {
  public static final java.util.List<String> states = new java.util.ArrayList<>();
  public static int d(String tag, String message) { states.add(message); return 0; }
}
''',
    "android/view/Gravity.java": "package android.view; public class Gravity { public static final int CENTER = 17; }",
    "android/view/View.java": r'''
package android.view;
public class View {
  public static final int VISIBLE = 0, INVISIBLE = 4, GONE = 8;
  public static final int SYSTEM_UI_FLAG_LIGHT_STATUS_BAR = 8192, SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR = 16;
  public interface OnClickListener { void onClick(View view); }
  private int visibility = VISIBLE;
  private OnClickListener click;
  public View() {}
  public View(android.content.Context context) {}
  public void setVisibility(int value) { visibility = value; }
  public int getVisibility() { return visibility; }
  public void setBackgroundColor(int value) {}
  public void bringToFront() {}
  public void setOnClickListener(OnClickListener value) { click = value; }
  public boolean performClick() { if (click == null) return false; click.onClick(this); return true; }
  public void setSystemUiVisibility(int flags) {}
  public WindowInsetsController getWindowInsetsController() { return new WindowInsetsController(); }
}
''',
    "android/view/ViewGroup.java": r'''
package android.view;
public class ViewGroup extends View {
  public ViewGroup(android.content.Context context) { super(context); }
  public static class LayoutParams { public static final int MATCH_PARENT = -1; public LayoutParams(int width, int height) {} }
  public void addView(View view, LayoutParams params) {}
}
''',
    "android/view/WindowInsetsController.java": "package android.view; public class WindowInsetsController { public static final int APPEARANCE_LIGHT_STATUS_BARS = 8, APPEARANCE_LIGHT_NAVIGATION_BARS = 16; public void setSystemBarsAppearance(int appearance, int mask) {} }",
    "android/view/Window.java": r'''
package android.view;
public class Window {
  public void setStatusBarColor(int value) {}
  public void setNavigationBarColor(int value) {}
  public View getDecorView() { return new View(); }
  public WindowInsetsController getInsetsController() { return new WindowInsetsController(); }
}
''',
    "android/widget/FrameLayout.java": "package android.widget; public class FrameLayout extends android.view.ViewGroup { public FrameLayout(android.content.Context context) { super(context); } }",
    "android/widget/TextView.java": r'''
package android.widget;
public class TextView extends android.view.View {
  public TextView(android.content.Context context) { super(context); }
  public void setText(int value) {} public void setTextColor(int value) {}
  public void setTextSize(float value) {} public void setGravity(int value) {}
  public void setPadding(int a, int b, int c, int d) {}
  public void setShadowLayer(float radius, float x, float y, int color) {}
}
''',
    "android/webkit/ValueCallback.java": "package android.webkit; public interface ValueCallback<T> { void onReceiveValue(T value); }",
    "android/webkit/WebView.java": r'''
package android.webkit;
public class WebView extends android.view.View {
  public static WebView last;
  public final java.util.List<ValueCallback<String>> evaluations = new java.util.ArrayList<>();
  public final java.util.List<VisualStateCallback> visuals = new java.util.ArrayList<>();
  public final java.util.List<Long> visualIds = new java.util.ArrayList<>();
  public int releases;
  public int stops;
  private String url;
  private WebViewClient client;
  public WebView(android.content.Context context) { super(context); last = this; }
  public static void setWebContentsDebuggingEnabled(boolean value) {}
  public WebSettings getSettings() { return new WebSettings(); }
  public void setWebChromeClient(WebChromeClient value) {}
  public void setWebViewClient(WebViewClient value) { client = value; }
  public WebViewClient getClient() { return client; }
  public void loadUrl(String value) { url = value; }
  public String getUrl() { return url; }
  public void stopLoading() { stops++; }
  public boolean canGoBack() { return false; }
  public void goBack() {} public void destroy() {}
  public void evaluateJavascript(String script, ValueCallback<String> callback) {
    if (script.contains("__robysAndroidHandoffRelease")) releases++;
    else evaluations.add(callback);
  }
  public abstract static class VisualStateCallback { public abstract void onComplete(long requestId); }
  public void postVisualStateCallback(long requestId, VisualStateCallback callback) { visuals.add(callback); visualIds.add(requestId); }
}
''',
    "android/webkit/WebSettings.java": r'''
package android.webkit;
public class WebSettings {
  public static final int LOAD_DEFAULT = -1, MIXED_CONTENT_NEVER_ALLOW = 1;
  public void setJavaScriptEnabled(boolean value) {} public void setDomStorageEnabled(boolean value) {}
  public void setCacheMode(int value) {} public void setAllowFileAccess(boolean value) {}
  public void setAllowContentAccess(boolean value) {} public void setMixedContentMode(int value) {}
  public void setMediaPlaybackRequiresUserGesture(boolean value) {} public void setSupportMultipleWindows(boolean value) {}
  public void setSafeBrowsingEnabled(boolean value) {}
}
''',
    "android/webkit/WebViewClient.java": r'''
package android.webkit;
public class WebViewClient {
  public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return false; }
  public boolean shouldOverrideUrlLoading(WebView view, String url) { return false; }
  public void onPageCommitVisible(WebView view, String url) {}
  public void onPageFinished(WebView view, String url) {}
  public void onReceivedSslError(WebView view, SslErrorHandler handler, android.net.http.SslError error) {}
  public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {}
}
''',
    "android/webkit/WebChromeClient.java": r'''
package android.webkit;
public class WebChromeClient {
  public void onPermissionRequest(PermissionRequest request) {}
  public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {}
}
''',
    "android/webkit/WebResourceRequest.java": "package android.webkit; public interface WebResourceRequest { android.net.Uri getUrl(); boolean isForMainFrame(); }",
    "android/webkit/WebResourceError.java": "package android.webkit; public class WebResourceError {}",
    "android/webkit/SslErrorHandler.java": "package android.webkit; public class SslErrorHandler { public boolean cancelled; public void cancel() { cancelled = true; } }",
    "android/webkit/PermissionRequest.java": "package android.webkit; public class PermissionRequest { public void deny() {} }",
    "android/webkit/GeolocationPermissions.java": "package android.webkit; public class GeolocationPermissions { public interface Callback { void invoke(String origin, boolean allow, boolean retain); } }",
    "android/webkit/CookieManager.java": r'''
package android.webkit;
public class CookieManager {
  public static CookieManager getInstance() { return new CookieManager(); }
  public void setAcceptCookie(boolean value) {} public void setAcceptThirdPartyCookies(WebView view, boolean value) {}
}
''',
    "androidx/activity/ComponentActivity.java": r'''
package androidx.activity;
public class ComponentActivity extends android.content.Context {
  protected void onCreate(android.os.Bundle state) {} protected void onDestroy() {}
  public void setContentView(android.view.View view) {}
  public android.view.Window getWindow() { return new android.view.Window(); }
  public OnBackPressedDispatcher getOnBackPressedDispatcher() { return new OnBackPressedDispatcher(); }
}
''',
    "androidx/activity/OnBackPressedDispatcher.java": "package androidx.activity; public class OnBackPressedDispatcher { public void addCallback(ComponentActivity activity, OnBackPressedCallback callback) {} public void onBackPressed() {} }",
    "androidx/activity/OnBackPressedCallback.java": "package androidx.activity; public abstract class OnBackPressedCallback { public OnBackPressedCallback(boolean value) {} public void setEnabled(boolean value) {} public abstract void handleOnBackPressed(); }",
    "com/robys/coffeehouse/R.java": "package com.robys.coffeehouse; public class R { public static class string { public static final int load_error = 1; } public static class color { public static final int robys_white = -1; } }",
    "com/robys/coffeehouse/RobysSplashView.java": r'''
package com.robys.coffeehouse;
public class RobysSplashView extends android.view.View {
  public int dismissals;
  public RobysSplashView(android.content.Context context) { super(context); }
  public void resetAndShow() { setVisibility(VISIBLE); }
  public void dismiss() { dismissals++; setVisibility(GONE); }
}
''',
}
