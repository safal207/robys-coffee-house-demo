# Roby's Coffee House Android wrapper — v1.2 rebuild

This directory is the **canonical source-first Android wrapper** for the Web/PWA product.

It intentionally returns to the lightweight v1.1 architecture while adding a native
Roby's launch experience. It does **not** reuse the experimental Kotlin/Compose v1.2 APK.

## Release identity

- applicationId: `com.robys.coffeehouse`
- versionCode: `3`
- versionName: `1.2`
- minSdk: `23`
- targetSdk: `36`
- compileSdk: `37`
- primary URL: `https://safal207.github.io/robys-coffee-house-demo/`

The release must continue the v1.0/v1.1 signer lineage. The expected historical
certificate SHA-256 is:

`c9992ce319789cadbcb5111ca33b86eb6e9ffbb36f317c8aa25b36c95c43719e`

Do not commit keystores, passwords, or other signing secrets.

## Native launch sequence

The custom `RobysSplashView` is deliberately dependency-free:

1. coffee bean appears and rotates;
2. bean cross-fades into a cup;
3. steam rises;
4. the Roby's Organic O and wordmark appear;
5. the splash fades into the existing Web/PWA interface.

The full custom sequence is about 1.85 seconds. Android 12+ first shows a matching
white system splash with the local Organic O so startup does not flash or jump.

When Android animations are disabled, the custom animation collapses to the final
brand state instead of forcing motion.

## WebView security contract

The wrapper keeps the old v1.1 security posture:

- HTTPS-only network policy;
- only the Roby's GitHub Pages path may remain inside the WebView;
- external URLs are handed to the operating system;
- SSL errors are cancelled;
- file/content access is disabled;
- mixed content is disabled;
- WebView debugging is disabled;
- geolocation and Web permission requests are denied;
- third-party cookies are disabled;
- application backup is disabled.

## Debug build

Use Java 17 and an Android SDK containing platform 37.

```bash
gradle :app:assembleDebug
```

## Release build and old-key continuity

Provide the existing v1.1 signing key only through environment variables:

```text
ROBYS_KEYSTORE_PATH
ROBYS_STORE_PASSWORD
ROBYS_KEY_ALIAS
ROBYS_KEY_PASSWORD
```

Then build:

```bash
gradle :app:assembleRelease
```

The release build fails closed when signing configuration is absent.

After signing, verify the certificate before publishing:

```bash
apksigner verify --verbose --print-certs app/build/outputs/apk/release/app-release.apk
```

The signer SHA-256 must match the historical v1.1 fingerprint shown above.

## Required QA before replacing the published APK

1. Install v1.1 on a device/emulator.
2. Install the rebuilt v1.2 **over it** without uninstalling.
3. Confirm package upgrade succeeds and app data remains intact.
4. Verify splash timing with animations enabled and disabled.
5. Verify TR/EN/RU web journeys, menu search, offline/cache behavior and back navigation.
6. Verify external links escape the WebView and SSL errors fail closed.
7. Run the repository web contracts (`npm run check` and `npm run verify:security`).
8. Only then replace the downloadable APK and regenerate integrity evidence.

Until that upgrade test passes, the experimental Compose APK remains historical
evidence only and must not be treated as the canonical release.
