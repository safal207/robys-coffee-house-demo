# PR #346: pinned current Android comparison

The original native smoke builds the PR shell but loads mutable public Pages.
Its 7ca13b9 run 34153293450 ended with WEB_READY_TIMEOUT followed by terminal
VISUAL_STATE_TIMEOUT. This experiment preserves that failure and the original
gate while identifying both halves of a separate diagnostic launch.

## Subjects

| Label | Committed web/native source |
| --- | --- |
| Current main | `e3edcf13de323c3adb80c9c96465f1dd0425eee0` |
| Current guest product | `7ca13b9adbf45b953c3b0997107d010e7bad1d9b` |

The subsequent 7799f80 visual binding repair changes no product bytes. The native
MainActivity and original capture script are identical between these subjects.
Each subject runs on a fresh API 36 emulator with the existing software backend,
screen recorder, timeout values and terminal-failure checks.

The previously verified diagnostic adapter serves committed assets through
WebView and service-worker interception at the existing trusted URL. External
requests receive HTTP 503. This transport changes network behavior and is not a
production deployment or physical-device benchmark. It is only suitable for
causal comparison with the same adapter on both subjects. No native performance
candidate, timeout change or special success path is included.

Local preflight passes all 6 resource-identity controls and all 14 original
capture controls. Every prepared asset matches its committed source: 236 main
files and 240 guest-product files. Original and instrumented native SHA-256 are
equal between subjects. Only source labels differ in the copied capture script.

The workflow retains manifests, original/instrumented native diff, APK asset
inventory, served-resource identities, raw recording/screenshots, device/provider
metadata and original capture exit. Identity verification and upload execute
also after a native failure; they do not override its verdict. Missing evidence
cannot demonstrate successful rendering. Results must be read after CI finishes.

No merge, deployment or APK release is authorized by this experiment. Both
subjects passing would still not cure a failed live-web launch. Both failing
would support an inherited mechanism, without identifying its internal cause.
