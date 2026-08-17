# Roby's Android WebView shell

This module is the thin Android shell for Roby's Coffee House. The product UI remains the web/PWA experience; Android owns launch continuity, WebView security, predictive back and the native-to-web handoff.

## Atomic launch contract

`SYSTEM_SPLASH -> NATIVE_BRAND_SURFACE -> WEBVIEW_LOADING_BEHIND -> WEB_HANDOFF_READY -> VISUAL_STATE_CONFIRMED -> NATIVE_SURFACE_REMOVED -> WEB_RELEASE -> PRODUCT`

The native surface is intentionally static. It matches the dedicated `?entry=android-handoff` web bridge so the full Morning motion is not played twice.

Security remains fail closed: HTTPS-only trusted host/path, mixed content disabled, file/content access disabled, third-party cookies disabled, permission requests denied and SSL errors cancelled.

Build with Java 17 / Android API 36:

```bash
gradle -p android-native :app:assembleDebug
```
