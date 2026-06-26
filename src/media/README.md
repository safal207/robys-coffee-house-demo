# Product video assets

The click-to-play Latte card expects the optimized video at:

`src/media/latte-story-360.mp4`

Verified delivery profile:

- container: MP4
- video: H.264, 360 × 360, 15 fps
- audio: AAC, 48 kbps
- duration: 5.07 seconds
- target size: 139,529 bytes
- SHA-256: `445bcc0bd126191a2798b7cc601bdcbb31b123787359342a6376c9f6de30901e`

The runtime deliberately sets `preload="none"` and assigns the source only after a user click, so this asset must not affect the landing-page network waterfall or Lighthouse score.
