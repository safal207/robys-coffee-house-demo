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
    private static final String APP_URL = "https://safal207.github.io/robys-coffee-house-demo/?entry=android-handoff";
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

    private final Runnable loadCommitSlow = () -> {
        if (!handoffComplete && !mainFrameCommitted) {
            debugState("LOAD_COMMIT_SLOW");
        }
    };

    private final Runnable loadCommitHardTimeout = () -> {
        if (!handoffComplete && !mainFrameCommitted) {
            debugState("LOAD_COMMIT_TIMEOUT");
            showLoadError();
        }
    };

    private final Runnable bridgeReadyTimeout = () -> {
        if (!handoffComplete && mainFrameCommitted && !visualStateRequested) {
            debugState("WEB_READY_TIMEOUT");
            requestRevealWhenVisualStateReady(webView, false);
        }
    };

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
        mainFrameCommitted = false;
        visualStateRequested = false;
        handoffComplete = false;
        bridgeReadyAtReveal = false;
        bridgeDeadlineAt = 0L;
        errorView.setVisibility(View.GONE);
        splashView.resetAndShow();
        configureLaunchSystemBars();
        debugState("NATIVE_SURFACE");
        webView.loadUrl(APP_URL);
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
                debugState("SSL_ERROR");
                showLoadError();
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error
            ) {
                if (request.isForMainFrame()) {
                    debugState("MAIN_FRAME_ERROR");
                    showLoadError();
                }
            }
        });
    }

    private void markTrustedFrameCommitted(WebView view, String url) {
        if (handoffComplete || url == null || !isTrusted(Uri.parse(url))) return;

        if (!mainFrameCommitted) {
            mainFrameCommitted = true;
            bridgeDeadlineAt = SystemClock.uptimeMillis() + BRIDGE_READY_TIMEOUT_MS;
            mainHandler.removeCallbacks(loadCommitSlow);
            mainHandler.removeCallbacks(loadCommitHardTimeout);
            mainHandler.postDelayed(bridgeReadyTimeout, BRIDGE_READY_TIMEOUT_MS);
            debugState("WEB_COMMITTED");
        }
        pollBridgeReady(view);
    }

    private void pollBridgeReady(WebView view) {
        if (handoffComplete || visualStateRequested || !mainFrameCommitted || view == null) return;
        String currentUrl = view.getUrl();
        if (currentUrl == null || !isTrusted(Uri.parse(currentUrl))) return;

        if (SystemClock.uptimeMillis() >= bridgeDeadlineAt) {
            bridgeReadyTimeout.run();
            return;
        }

        view.evaluateJavascript(
                "(function(){var d=document.documentElement;return d&&d.dataset?(d.dataset.robysAndroidHandoff||''):'';})()",
                value -> {
                    if (handoffComplete || visualStateRequested) return;
                    if ("\"ready\"".equals(value)) {
                        debugState("WEB_READY");
                        requestRevealWhenVisualStateReady(view, true);
                    } else {
                        mainHandler.postDelayed(() -> pollBridgeReady(view), BRIDGE_POLL_MS);
                    }
                }
        );
    }

    private void requestRevealWhenVisualStateReady(WebView view, boolean bridgeReady) {
        if (visualStateRequested || handoffComplete || view == null) return;
        String currentUrl = view.getUrl();
        if (currentUrl == null || !isTrusted(Uri.parse(currentUrl))) return;

        visualStateRequested = true;
        bridgeReadyAtReveal = bridgeReady;
        cancelHandoffCallbacks();
        long requestId = SystemClock.uptimeMillis();
        view.postVisualStateCallback(requestId, new WebView.VisualStateCallback() {
            @Override
            public void onComplete(long ignoredRequestId) {
                completeHandoff(view);
            }
        });
        mainHandler.postDelayed(() -> completeHandoff(view), VISUAL_CALLBACK_TIMEOUT_MS);
    }

    private void completeHandoff(WebView view) {
        if (handoffComplete || view == null || !mainFrameCommitted) return;
        String currentUrl = view.getUrl();
        if (currentUrl == null || !isTrusted(Uri.parse(currentUrl))) return;

        handoffComplete = true;
        debugState("VISUAL_STATE_CONFIRMED");
        splashView.dismiss();
        configureProductSystemBars();
        releaseWebHandoff(view);
        debugState(bridgeReadyAtReveal ? "HANDOFF_COMPLETE_WEB_READY" : "HANDOFF_COMPLETE_FALLBACK");
        debugState("HANDOFF_COMPLETE");
    }

    private void releaseWebHandoff(WebView view) {
        view.evaluateJavascript(
                "typeof window.__robysAndroidHandoffRelease==='function'?(window.__robysAndroidHandoffRelease(),'released'):'missing'",
                null
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
        view.setTextColor(getColor(R.color.robys_ink));
        view.setTextSize(18f);
        view.setGravity(Gravity.CENTER);
        int padding = dp(32);
        view.setPadding(padding, padding, padding, padding);
        view.setBackgroundColor(Color.WHITE);
        view.setOnClickListener(v -> beginTrustedLoad());
        return view;
    }

    private void showLoadError() {
        if (handoffComplete) return;
        handoffComplete = true;
        cancelHandoffCallbacks();
        splashView.dismiss();
        errorView.setVisibility(View.VISIBLE);
        configureProductSystemBars();
    }

    private void cancelHandoffCallbacks() {
        mainHandler.removeCallbacks(loadCommitSlow);
        mainHandler.removeCallbacks(loadCommitHardTimeout);
        mainHandler.removeCallbacks(bridgeReadyTimeout);
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
