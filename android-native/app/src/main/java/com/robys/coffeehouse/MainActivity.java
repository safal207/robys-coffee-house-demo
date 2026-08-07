package com.robys.coffeehouse;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
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
    private static final String TAG = "RobysLaunch";
    private static final String APP_URL = "https://safal207.github.io/robys-coffee-house-demo/";
    private static final String TRUSTED_HOST = "safal207.github.io";
    private static final String TRUSTED_PATH_PREFIX = "/robys-coffee-house-demo/";
    private static final long WEBVIEW_WARMUP_DELAY_MS = 2000L;
    private static final int VISUAL_REVEAL_PROGRESS = 35;

    private FrameLayout root;
    private WebView webView;
    private RobysSplashView splashView;
    private TextView errorView;
    private boolean revealRequested;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.i(TAG, "onCreate");
        configureSystemBars();

        root = new FrameLayout(this);

        errorView = buildErrorView();
        errorView.setVisibility(View.GONE);
        root.addView(errorView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        splashView = new RobysSplashView(this);
        splashView.setOnMotionStartedListener(() -> {
            Log.i(TAG, "brandMotionStarted; scheduling WebView warmup");
            splashView.postDelayed(this::warmUpOrReloadWebView, WEBVIEW_WARMUP_DELAY_MS);
        });
        root.addView(splashView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        setContentView(root);
        configureBackNavigation();
        startBrandMotionAfterSystemSplash();
    }

    private void startBrandMotionAfterSystemSplash() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            getSplashScreen().setOnExitAnimationListener(splashScreenView -> {
                Log.i(TAG, "systemSplashExit");
                splashScreenView.remove();
                splashView.postOnAnimation(() -> {
                    Log.i(TAG, "starting brand motion after system splash exit");
                    splashView.startMotion();
                });
            });
        } else {
            splashView.postOnAnimation(() -> {
                Log.i(TAG, "starting brand motion on pre-S device");
                splashView.startMotion();
            });
        }
    }

    private void warmUpOrReloadWebView() {
        revealRequested = false;
        Log.i(TAG, "warmUpOrReloadWebView existing=" + (webView != null));
        if (webView == null) {
            initializeWebView();
        } else {
            webView.reload();
        }
    }

    private void initializeWebView() {
        if (isFinishing() || isDestroyed() || webView != null) {
            Log.i(TAG, "initializeWebView skipped finishing=" + isFinishing()
                    + " destroyed=" + isDestroyed() + " existing=" + (webView != null));
            return;
        }

        Log.i(TAG, "initializeWebView begin");
        webView = new WebView(this);
        root.addView(webView, 0, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        configureWebView();
        Log.i(TAG, "loadUrl " + APP_URL);
        webView.loadUrl(APP_URL);
    }

    private void configureSystemBars() {
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
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
        view.setOnClickListener(v -> retryWebView());
        return view;
    }

    private void retryWebView() {
        Log.i(TAG, "retryWebView");
        errorView.setVisibility(View.GONE);
        revealRequested = false;
        splashView.resetAndShow();
        splashView.postOnAnimation(splashView::startMotion);
    }

    private void configureWebView() {
        WebView.setWebContentsDebuggingEnabled(false);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
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

            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                Log.i(TAG, "progress=" + newProgress + " url=" + view.getUrl());
                if (newProgress >= VISUAL_REVEAL_PROGRESS) {
                    requestRevealWhenVisualStateReady(view, "progress:" + newProgress);
                }
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isTrusted(uri)) {
                    return false;
                }
                openExternal(uri);
                return true;
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri uri = Uri.parse(url);
                if (isTrusted(uri)) {
                    return false;
                }
                openExternal(uri);
                return true;
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                Log.i(TAG, "pageCommitVisible url=" + url);
                if (isTrusted(Uri.parse(url))) {
                    requestRevealWhenVisualStateReady(view, "pageCommitVisible");
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                Log.i(TAG, "pageFinished url=" + url);
                if (isTrusted(Uri.parse(url))) {
                    requestRevealWhenVisualStateReady(view, "pageFinished");
                }
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                Log.e(TAG, "sslError primary=" + error.getPrimaryError());
                handler.cancel();
                showLoadError();
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error
            ) {
                if (request.isForMainFrame()) {
                    Log.e(TAG, "mainFrameError code=" + error.getErrorCode()
                            + " url=" + request.getUrl());
                    showLoadError();
                }
            }
        });
    }

    private void requestRevealWhenVisualStateReady(WebView view, String source) {
        if (revealRequested || view == null) {
            Log.i(TAG, "revealRequest skipped source=" + source
                    + " alreadyRequested=" + revealRequested + " viewNull=" + (view == null));
            return;
        }

        String currentUrl = view.getUrl();
        if (currentUrl == null || !isTrusted(Uri.parse(currentUrl))) {
            Log.i(TAG, "revealRequest blocked source=" + source + " url=" + currentUrl);
            return;
        }

        revealRequested = true;
        long requestId = SystemClock.uptimeMillis();
        Log.i(TAG, "visualStateRequest id=" + requestId + " source=" + source
                + " progress=" + view.getProgress() + " url=" + currentUrl);
        view.postVisualStateCallback(requestId, new WebView.VisualStateCallback() {
            @Override
            public void onComplete(long completedRequestId) {
                Log.i(TAG, "visualStateComplete id=" + completedRequestId
                        + " progress=" + view.getProgress() + " url=" + view.getUrl());
                splashView.dismissWhenMotionComplete();
                Log.i(TAG, "dismissWhenMotionComplete invoked");
            }
        });
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
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) {
            return false;
        }
        if (!TRUSTED_HOST.equalsIgnoreCase(uri.getHost())) {
            return false;
        }
        String path = uri.getPath();
        return path != null && path.startsWith(TRUSTED_PATH_PREFIX);
    }

    private void openExternal(Uri uri) {
        if (uri == null) {
            return;
        }
        String scheme = uri.getScheme();
        if (scheme == null || !(
                "https".equalsIgnoreCase(scheme) ||
                "http".equalsIgnoreCase(scheme) ||
                "mailto".equalsIgnoreCase(scheme) ||
                "tel".equalsIgnoreCase(scheme) ||
                "geo".equalsIgnoreCase(scheme)
        )) {
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(intent);
        } catch (ActivityNotFoundException ignored) {
            // Ignore unsupported schemes instead of exposing them to the WebView.
        }
    }

    private void showLoadError() {
        splashView.postDelayed(() -> {
            Log.i(TAG, "showLoadError dismissing splash");
            splashView.dismiss();
            errorView.setVisibility(View.VISIBLE);
        }, 350L);
    }

    @Override
    protected void onDestroy() {
        Log.i(TAG, "onDestroy");
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
