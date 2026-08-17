package com.robys.coffeehouse;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;

public final class MainActivity extends ComponentActivity {
    private static final String APP_URL_BASE = "https://safal207.github.io/robys-coffee-house-demo/?entry=android-handoff";
    private static final String TRUSTED_HOST = "safal207.github.io";
    private static final String TRUSTED_PATH_PREFIX = "/robys-coffee-house-demo/";
    private static final String HANDOFF_TAG = "RobysHandoff";
    private static final long LOAD_COMMIT_SLOW_MS = 8_000L;
    private static final long LOAD_COMMIT_HARD_TIMEOUT_MS = 24_000L;
    private static final long BRIDGE_READY_TIMEOUT_MS = 3_500L;
    private static final long BRIDGE_POLL_MS = 48L;
    private static final long VISUAL_CALLBACK_TIMEOUT_MS = 1_500L;
    private static final int LAUNCH_COLOR = Color.rgb(36, 28, 27);

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private WebView webView;
    private RobysSplashView splashView;
    private TextView errorView;
    private boolean mainFrameCommitted;
    private boolean visualStateRequested;
    private boolean handoffComplete;
    private boolean bridgeReadyAtReveal;
    private long bridgeDeadlineAt;
    private int activeLoadGeneration;
    private Runnable loadCommitSlow;
    private Runnable loadCommitHardTimeout;
    private Runnable bridgeReadyTimeout;
    private Runnable visualStateTimeout;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        root = new FrameLayout(this);
        root.setBackgroundColor(LAUNCH_COLOR);

        webView = new WebView(this);
        webView.setBackgroundColor(LAUNCH_COLOR);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        errorView = buildErrorView();
        errorView.setVisibility(View.GONE);
        root.addView(errorView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        splashView = new RobysSplashView(this);
        root.addView(splashView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        setContentView(root);
        configureWebView();
        configureBackNavigation();
        beginTrustedLoad();
    }

    private void beginTrustedLoad() {
        cancelHandoffCallbacks();
        final int generation = ++activeLoadGeneration;
        mainFrameCommitted = false;
        visualStateRequested = false;
        handoffComplete = false;
        bridgeReadyAtReveal = false;
        bridgeDeadlineAt = 0L;
        errorView.setVisibility(View.GONE);
        splashView.resetAndShow();
        splashView.bringToFront();
        configureLaunchSystemBars();
        debugState("NATIVE_SURFACE");

        webView.stopLoading();
        webView.loadUrl(appUrlForGeneration(generation));

        loadCommitSlow = () -> {
            if (isActiveGeneration(generation) && !handoffComplete && !mainFrameCommitted) {
                debugState("LOAD_COMMIT_SLOW");
            }
        };
        loadCommitHardTimeout = () -> {
            if (isActiveGeneration(generation) && !handoffComplete && !mainFrameCommitted) {
                debugState("LOAD_COMMIT_TIMEOUT");
                showLoadError(generation);
            }
        };
        mainHandler.postDelayed(loadCommitSlow, LOAD_COMMIT_SLOW_MS);
        mainHandler.postDelayed(loadCommitHardTimeout, LOAD_COMMIT_HARD_TIMEOUT_MS);
    }

    private void configureWebView() {
        WebView.setWebContentsDebuggingEnabled(false);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.deny();
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(
                    String origin,
                    GeolocationPermissions.Callback callback
            ) {
                callback.invoke(origin, false, false);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isTrusted(uri)) return false;
                openExternal(uri);
                return true;
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri uri = Uri.parse(url);
                if (isTrusted(uri)) return false;
                openExternal(uri);
                return true;
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                markTrustedFrameCommitted(view, url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                markTrustedFrameCommitted(view, url);
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                int generation = generationFromUrl(error != null ? error.getUrl() : null);
                if (!isActiveGeneration(generation)) return;
                debugState("SSL_ERROR");
                showLoadError(generation);
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error
            ) {
                if (!request.isForMainFrame()) return;
                int generation = generationFromUri(request.getUrl());
                if (!isActiveGeneration(generation)) return;
                debugState("MAIN_FRAME_ERROR");
                showLoadError(generation);
            }
        });
    }

    private void markTrustedFrameCommitted(WebView view, String url) {
        if (handoffComplete || url == null) return;
        Uri uri = Uri.parse(url);
        int generation = generationFromUri(uri);
        if (!isActiveGeneration(generation) || !isTrusted(uri)) return;

        if (!mainFrameCommitted) {
            mainFrameCommitted = true;
            bridgeDeadlineAt = SystemClock.uptimeMillis() + BRIDGE_READY_TIMEOUT_MS;
            removeCallback(loadCommitSlow);
            removeCallback(loadCommitHardTimeout);
            bridgeReadyTimeout = () -> {
                if (isActiveGeneration(generation)
                        && !handoffComplete
                        && mainFrameCommitted
                        && !visualStateRequested) {
                    debugState("WEB_READY_TIMEOUT");
                    requestRevealWhenVisualStateReady(view, false, generation);
                }
            };
            mainHandler.postDelayed(bridgeReadyTimeout, BRIDGE_READY_TIMEOUT_MS);
            debugState("WEB_COMMITTED");
        }
        pollBridgeReady(view, generation);
    }

    private void pollBridgeReady(WebView view, int generation) {
        if (!isActiveGeneration(generation)
                || handoffComplete
                || visualStateRequested
                || !mainFrameCommitted
                || view == null) return;
        String currentUrl = view.getUrl();
        if (!isCurrentGenerationUrl(currentUrl, generation)) return;

        if (SystemClock.uptimeMillis() >= bridgeDeadlineAt) {
            if (bridgeReadyTimeout != null) bridgeReadyTimeout.run();
            return;
        }

        view.evaluateJavascript(
                "(function(){var d=document.documentElement;return d&&d.dataset?(d.dataset.robysAndroidHandoff||''):'';})()",
                value -> {
                    if (!isActiveGeneration(generation) || handoffComplete || visualStateRequested) return;
                    if (!isCurrentGenerationUrl(view.getUrl(), generation)) return;
                    if ("\"ready\"".equals(value)) {
                        debugState("WEB_READY");
                        requestRevealWhenVisualStateReady(view, true, generation);
                    } else {
                        mainHandler.postDelayed(() -> pollBridgeReady(view, generation), BRIDGE_POLL_MS);
                    }
                }
        );
    }

    private void requestRevealWhenVisualStateReady(WebView view, boolean bridgeReady, int generation) {
        if (!isActiveGeneration(generation) || visualStateRequested || handoffComplete || view == null) return;
        if (!isCurrentGenerationUrl(view.getUrl(), generation)) return;

        visualStateRequested = true;
        bridgeReadyAtReveal = bridgeReady;
        cancelHandoffCallbacks();
        long requestId = SystemClock.uptimeMillis();
        view.postVisualStateCallback(requestId, new WebView.VisualStateCallback() {
            @Override
            public void onComplete(long ignoredRequestId) {
                completeHandoff(view, generation);
            }
        });
        visualStateTimeout = () -> {
            if (isActiveGeneration(generation) && !handoffComplete && visualStateRequested) {
                debugState("VISUAL_STATE_TIMEOUT");
                showLoadError(generation);
            }
        };
        mainHandler.postDelayed(visualStateTimeout, VISUAL_CALLBACK_TIMEOUT_MS);
    }

    private void completeHandoff(WebView view, int generation) {
        if (!isActiveGeneration(generation)
                || handoffComplete
                || view == null
                || !mainFrameCommitted
                || !isCurrentGenerationUrl(view.getUrl(), generation)) return;

        handoffComplete = true;
        cancelHandoffCallbacks();
        debugState("VISUAL_STATE_CONFIRMED");
        splashView.dismiss();
        configureProductSystemBars();
        releaseWebHandoff(view, generation);
        debugState(bridgeReadyAtReveal ? "HANDOFF_COMPLETE_WEB_READY" : "HANDOFF_COMPLETE_FALLBACK");
        debugState("HANDOFF_COMPLETE");
    }

    private void releaseWebHandoff(WebView view, int generation) {
        if (!isActiveGeneration(generation) || !isCurrentGenerationUrl(view.getUrl(), generation)) return;
        view.evaluateJavascript(
                "typeof window.__robysAndroidHandoffRelease==='function'?(window.__robysAndroidHandoffRelease(),'released'):'missing'",
                ignored -> {
                    if (!isActiveGeneration(generation)) return;
                }
        );
    }

    private void configureLaunchSystemBars() {
        getWindow().setStatusBarColor(LAUNCH_COLOR);
        getWindow().setNavigationBarColor(LAUNCH_COLOR);
        setLightSystemBarAppearance(false);
    }

    private void configureProductSystemBars() {
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);
        setLightSystemBarAppearance(true);
    }

    private void setLightSystemBarAppearance(boolean light) {
        View decorView = getWindow().getDecorView();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = decorView.getWindowInsetsController();
            if (controller != null) {
                int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                controller.setSystemBarsAppearance(light ? mask : 0, mask);
            }
            return;
        }

        int flags = light ? View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR : 0;
        if (light && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        decorView.setSystemUiVisibility(flags);
    }

    private TextView buildErrorView() {
        TextView view = new TextView(this);
        view.setText(R.string.load_error);
        view.setTextColor(getColor(R.color.robys_white));
        view.setTextSize(18f);
        view.setGravity(Gravity.CENTER);
        int padding = dp(32);
        view.setPadding(padding, padding, padding, padding);
        view.setBackgroundColor(Color.TRANSPARENT);
        view.setShadowLayer(dp(6), 0f, dp(2), Color.argb(160, 0, 0, 0));
        view.setOnClickListener(v -> beginTrustedLoad());
        return view;
    }

    private void showLoadError(int generation) {
        if (!isActiveGeneration(generation) || handoffComplete) return;
        handoffComplete = true;
        cancelHandoffCallbacks();
        webView.stopLoading();
        splashView.resetAndShow();
        errorView.setVisibility(View.VISIBLE);
        errorView.bringToFront();
        configureLaunchSystemBars();
    }

    private void cancelHandoffCallbacks() {
        removeCallback(loadCommitSlow);
        removeCallback(loadCommitHardTimeout);
        removeCallback(bridgeReadyTimeout);
        removeCallback(visualStateTimeout);
        loadCommitSlow = null;
        loadCommitHardTimeout = null;
        bridgeReadyTimeout = null;
        visualStateTimeout = null;
    }

    private void removeCallback(Runnable callback) {
        if (callback != null) mainHandler.removeCallbacks(callback);
    }

    private String appUrlForGeneration(int generation) {
        return APP_URL_BASE + "&handoff-gen=" + generation;
    }

    private int generationFromUrl(String url) {
        if (url == null) return -1;
        return generationFromUri(Uri.parse(url));
    }

    private int generationFromUri(Uri uri) {
        if (uri == null || !isTrusted(uri)) return -1;
        String value = uri.getQueryParameter("handoff-gen");
        if (value == null) return -1;
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException ignored) {
            return -1;
        }
    }

    private boolean isCurrentGenerationUrl(String url, int generation) {
        return isActiveGeneration(generation) && generationFromUrl(url) == generation;
    }

    private boolean isActiveGeneration(int generation) {
        return generation > 0 && generation == activeLoadGeneration;
    }

    private void configureBackNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        });
    }

    private boolean isTrusted(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) return false;
        if (!TRUSTED_HOST.equalsIgnoreCase(uri.getHost())) return false;
        String path = uri.getPath();
        return path != null && path.startsWith(TRUSTED_PATH_PREFIX);
    }

    private void openExternal(Uri uri) {
        if (uri == null) return;
        String scheme = uri.getScheme();
        if (scheme == null || !(
                "https".equalsIgnoreCase(scheme)
                        || "http".equalsIgnoreCase(scheme)
                        || "mailto".equalsIgnoreCase(scheme)
                        || "tel".equalsIgnoreCase(scheme)
                        || "geo".equalsIgnoreCase(scheme)
        )) return;

        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(intent);
        } catch (ActivityNotFoundException ignored) {
            // Unsupported external schemes remain outside the WebView.
        }
    }

    private void debugState(String state) {
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            Log.d(HANDOFF_TAG, state);
        }
    }

    @Override
    protected void onDestroy() {
        cancelHandoffCallbacks();
        ++activeLoadGeneration;
        mainHandler.removeCallbacksAndMessages(null);
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
