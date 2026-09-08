package com.robys.coffeehouse;

import android.net.Uri;
import android.net.http.SslError;
import android.os.Handler;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.widget.TextView;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;

/** Calls real MainActivity lifecycle/WebView callbacks; only platform timing is fake. */
public final class HandoffDeadlineHarness {
    private interface Scenario { void run() throws Exception; }
    private record Test(String name, Scenario scenario) {}
    private static final List<Test> tests = new ArrayList<>();

    private static Object field(MainActivity activity, String name) throws Exception {
        Field field = MainActivity.class.getDeclaredField(name);
        field.setAccessible(true);
        return field.get(activity);
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message + "; states=" + Log.states);
    }

    private static long count(String state) {
        return Log.states.stream().filter(state::equals).count();
    }

    private static void add(String name, Scenario scenario) {
        tests.add(new Test(name, scenario));
    }

    private static final class Fixture {
        final MainActivity activity;
        final WebView web;
        final Handler handler;
        final RobysSplashView splash;
        final TextView error;

        Fixture() throws Exception {
            Log.states.clear();
            SystemClock.now = 1000;
            android.os.Build.VERSION.SDK_INT = 36;
            activity = new MainActivity();
            activity.onCreate(null);
            web = WebView.last;
            handler = Handler.last;
            splash = (RobysSplashView) field(activity, "splashView");
            error = (TextView) field(activity, "errorView");
            check(web.getUrl().endsWith("&handoff-gen=1"), "actual lifecycle must begin generation 1");
        }

        Fixture commit() {
            SystemClock.now = 2000;
            web.getClient().onPageCommitVisible(web, web.getUrl());
            check(web.evaluations.size() == 1, "actual commit must request bridge evaluation");
            return this;
        }

        Fixture ready() {
            commit();
            SystemClock.now = 2500;
            js(0, "\"ready\"");
            check(count("WEB_READY") == 1 && web.visuals.size() == 1,
                    "in-budget ready must request visual confirmation");
            return this;
        }

        Fixture fallback() {
            commit();
            SystemClock.now = 5500;
            handler.runDue();
            check(count("WEB_READY_TIMEOUT") == 1 && web.visuals.size() == 1,
                    "existing timeout must still request fallback confirmation");
            return this;
        }

        void js(int index, String value) { web.evaluations.get(index).onReceiveValue(value); }
        void visual(int index) { web.visuals.get(index).onComplete(web.visualIds.get(index)); }

        void assertOverdueTimerQueued() {
            check(handler.pending.stream().anyMatch(item -> item.at <= SystemClock.now),
                    "test must deliver callback before an already-due timer");
        }

        void assertSuccess(String path) {
            check(count("HANDOFF_COMPLETE") == 1 && count(path) == 1, "one expected completion");
            check(count("VISUAL_STATE_CONFIRMED") == 1, "one visual confirmation");
            check(count("VISUAL_STATE_TIMEOUT") == 0, "no visual failure on success");
            check(web.releases == 1 && splash.dismissals == 1, "one real release dispatch and cover dismissal");
            check(error.getVisibility() == View.GONE && splash.getVisibility() == View.GONE,
                    "success view state");
        }

        void assertVisualFailure() {
            check(count("VISUAL_STATE_TIMEOUT") == 1, "expired visual callback must take existing timeout path");
            check(count("HANDOFF_COMPLETE") == 0 && count("VISUAL_STATE_CONFIRMED") == 0,
                    "expired callback must not certify completion");
            check(web.releases == 0 && splash.dismissals == 0, "failure must not release the product");
            check(error.getVisibility() == View.VISIBLE && splash.getVisibility() == View.VISIBLE,
                    "existing retry UI must remain visible");
        }

        void sslError() {
            SslErrorHandler ssl = new SslErrorHandler();
            web.getClient().onReceivedSslError(web, ssl, new SslError(web.getUrl()));
            check(ssl.cancelled, "actual SSL failure must cancel");
        }

        void retry() {
            error.performClick();
            check(web.getUrl().endsWith("&handoff-gen=2"), "actual retry must increment generation");
            check(error.getVisibility() == View.GONE && splash.getVisibility() == View.VISIBLE,
                    "retry must reset visible state");
        }
    }

    public static void main(String[] args) throws Exception {
        for (int offset : new int[] {-1, 0, 1}) {
            add("bridge callback deadline " + offset, () -> {
                Fixture f = new Fixture().commit();
                SystemClock.now = 5500 + offset;
                if (offset >= 0) f.assertOverdueTimerQueued();
                f.js(0, "\"ready\"");
                check(count("WEB_READY") == (offset < 0 ? 1 : 0), "ready classification at bridge boundary");
                check(count("WEB_READY_TIMEOUT") == (offset < 0 ? 0 : 1), "bridge timeout classification");
                check(f.web.visuals.size() == 1, "one visual request including preserved fallback");
                f.handler.runDue();
                f.js(0, "\"ready\"");
                check(f.web.visuals.size() == 1, "overdue timer and duplicate callback cannot duplicate request");
                SystemClock.now += 100;
                f.visual(0);
                f.assertSuccess(offset < 0 ? "HANDOFF_COMPLETE_WEB_READY" : "HANDOFF_COMPLETE_FALLBACK");
            });
            add("ready visual callback deadline " + offset, () -> {
                Fixture f = new Fixture().ready();
                SystemClock.now = 4000 + offset;
                if (offset >= 0) f.assertOverdueTimerQueued();
                f.visual(0);
                f.handler.runDue();
                f.visual(0);
                if (offset < 0) f.assertSuccess("HANDOFF_COMPLETE_WEB_READY");
                else f.assertVisualFailure();
            });
            add("fallback visual callback deadline " + offset, () -> {
                Fixture f = new Fixture().fallback();
                SystemClock.now = 7000 + offset;
                if (offset >= 0) f.assertOverdueTimerQueued();
                f.visual(0);
                f.handler.runDue();
                f.visual(0);
                if (offset < 0) f.assertSuccess("HANDOFF_COMPLETE_FALLBACK");
                else f.assertVisualFailure();
            });
        }

        add("non-ready callback at expired bridge takes fallback immediately", () -> {
            Fixture f = new Fixture().commit();
            SystemClock.now = 5500;
            f.assertOverdueTimerQueued();
            f.js(0, "\"loading\"");
            check(count("WEB_READY_TIMEOUT") == 1 && f.web.visuals.size() == 1,
                    "expired delivery must not enqueue another bridge poll");
        });
        add("in-budget non-ready callback retains polling", () -> {
            Fixture f = new Fixture().commit();
            SystemClock.now = 2500;
            f.js(0, "\"loading\"");
            SystemClock.now = 2548;
            f.handler.runDue();
            check(f.web.evaluations.size() == 2 && f.web.visuals.isEmpty(), "existing 48ms poll remains");
            f.js(1, "\"ready\"");
            SystemClock.now = 2600;
            f.visual(0);
            f.assertSuccess("HANDOFF_COMPLETE_WEB_READY");
        });
        add("bridge timeout first ignores outstanding ready callback", () -> {
            Fixture f = new Fixture().fallback();
            f.js(0, "\"ready\"");
            check(count("WEB_READY") == 0 && f.web.visuals.size() == 1, "fallback cannot be relabelled ready");
            SystemClock.now = 5600;
            f.visual(0);
            f.assertSuccess("HANDOFF_COMPLETE_FALLBACK");
        });
        add("visual timeout first cannot be revived", () -> {
            Fixture f = new Fixture().ready();
            SystemClock.now = 4000;
            f.handler.runDue();
            f.visual(0);
            f.js(0, "\"ready\"");
            f.assertVisualFailure();
        });
        add("stale bridge callback cannot time out new generation", () -> {
            Fixture f = new Fixture().commit();
            f.sslError();
            SystemClock.now = 6000;
            f.retry();
            webCommit(f);
            List<String> before = List.copyOf(Log.states);
            f.js(0, "\"ready\"");
            check(Log.states.equals(before) && f.web.visuals.isEmpty(), "generation guard precedes deadline side effects");
            SystemClock.now = 6200;
            f.js(1, "\"ready\"");
            f.visual(0);
            f.assertSuccess("HANDOFF_COMPLETE_WEB_READY");
        });
        add("stale visual callback cannot fail retry", () -> {
            Fixture f = new Fixture().ready();
            f.sslError();
            SystemClock.now = 8000;
            f.retry();
            webCommit(f);
            List<String> before = List.copyOf(Log.states);
            f.visual(0);
            check(Log.states.equals(before), "old visual deadline cannot fail a new generation");
            f.js(1, "\"ready\"");
            SystemClock.now = 8100;
            f.visual(1);
            f.assertSuccess("HANDOFF_COMPLETE_WEB_READY");
        });
        add("changed URL bridge callback is ignored before expiry handling", () -> {
            Fixture f = new Fixture().commit();
            f.web.loadUrl("https://example.invalid/");
            SystemClock.now = 6000;
            List<String> before = List.copyOf(Log.states);
            f.js(0, "\"ready\"");
            check(Log.states.equals(before) && f.web.visuals.isEmpty(), "URL guard precedes bridge timeout");
        });
        add("changed URL visual callback is ignored before expiry handling", () -> {
            Fixture f = new Fixture().ready();
            f.web.loadUrl("https://example.invalid/");
            SystemClock.now = 5000;
            List<String> before = List.copyOf(Log.states);
            f.visual(0);
            check(Log.states.equals(before) && f.web.releases == 0, "URL guard precedes visual timeout");
        });
        add("SSL error before expired bridge cannot become fallback", () -> {
            Fixture f = new Fixture().commit();
            f.sslError();
            SystemClock.now = 6000;
            List<String> before = List.copyOf(Log.states);
            f.js(0, "\"ready\"");
            check(Log.states.equals(before) && f.web.visuals.isEmpty(), "error remains terminal");
        });
        add("main-frame error before visual completion remains terminal", () -> {
            Fixture f = new Fixture().ready();
            final Uri uri = Uri.parse(f.web.getUrl());
            f.web.getClient().onReceivedError(f.web, new WebResourceRequest() {
                public Uri getUrl() { return uri; }
                public boolean isForMainFrame() { return true; }
            }, new WebResourceError());
            SystemClock.now = 5000;
            List<String> before = List.copyOf(Log.states);
            f.visual(0);
            check(Log.states.equals(before) && f.web.releases == 0, "main-frame error cannot become success or another error");
        });
        add("destroy ignores pending bridge and visual callbacks", () -> {
            Fixture f = new Fixture().ready();
            f.activity.onDestroy();
            SystemClock.now = 10000;
            List<String> before = List.copyOf(Log.states);
            f.js(0, "\"ready\"");
            f.visual(0);
            check(Log.states.equals(before) && f.web.releases == 0 && f.handler.pending.isEmpty(),
                    "destroyed activity cannot be revived");
        });
        add("duplicate commit cannot restart bridge budget", () -> {
            Fixture f = new Fixture().commit();
            SystemClock.now = 5000;
            f.web.getClient().onPageFinished(f.web, f.web.getUrl());
            SystemClock.now = 5500;
            f.js(1, "\"ready\"");
            check(count("WEB_READY_TIMEOUT") == 1 && count("WEB_READY") == 0,
                    "second commit callback must preserve first deadline");
        });
        add("API23 fallback success still releases exactly once", () -> {
            Fixture f = new Fixture().fallback();
            android.os.Build.VERSION.SDK_INT = 23;
            SystemClock.now = 5600;
            f.visual(0);
            f.visual(0);
            f.handler.runDue();
            f.assertSuccess("HANDOFF_COMPLETE_FALLBACK");
        });

        int failed = 0;
        for (Test test : tests) {
            try {
                test.scenario.run();
                System.out.println("PASS: " + test.name);
            } catch (Throwable failure) {
                failed++;
                System.out.println("FAIL: " + test.name + ": " + failure);
            }
        }
        System.out.println("SUMMARY: " + (tests.size() - failed) + "/" + tests.size() + " passed");
        if (failed > 0) System.exit(1);
    }

    private static void webCommit(Fixture fixture) {
        fixture.web.getClient().onPageCommitVisible(fixture.web, fixture.web.getUrl());
    }
}
