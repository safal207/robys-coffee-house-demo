# Pairing video recovery, 28 October 2026

The reported black video card is the homepage San Sebastian / Iced Latte
pairing preview, between Iced Latte and Lotus. It is separate from the upcoming
Kinder Surprise menu card. The observed release was
`3e88ca4453a9049d5d24e3611af69be7d562171c`.

## Evidence and limits

The published MP4 returned HTTP 200 and a valid HTTP 206 range response, with
the same SHA-256 as the repository file. Nevertheless, FFprobe could not count
any decoded frames and full FFmpeg decoding failed with no packets. The former
validator checked container boxes and an `avc1` marker, so this invalid media
could pass. The exact old bytes are retained as a negative regression fixture.
The asset predates PR #470; that PR did not change it.

One cloud Chrome session advanced the old preview's playback clock and showed
the pairing poster. That did not establish decoded frames. The strict Actions
replay later measured zero frames. The evidence does not establish the exact
internals of the user's mobile media engine. The screenshot establishes the
user's playback failure; independent decoding establishes a file defect.

## Restored media

The owner-supplied original `1000027800(2).mp4` was recovered and inspected at
the beginning, middle and end. It contains the intended cake, Iced Latte and
pairing sequence. No replacement imagery was introduced.

| File | SHA-256 |
| --- | --- |
| Owner original | `c7eef7e92e4f4adcf3d914f15f24203155b10dcb80378d8bd5e607b5fec55b60` |
| Previously shipped / negative fixture | `29a75b89cb208a1471823671c05e2c8b27438dbc42a99c00af1eed02840d0bbf` |
| Restored web MP4 | `30432878c02b2c4d41ce79fae9c7704ad7681f6f9e6027a5cd1dd72db77e5493` |

```sh
ffmpeg -v error -i '1000027800(2).mp4' -map 0:v:0 -an -sn -dn \
  -c:v libx264 -profile:v baseline -level:v 3.1 -preset slow \
  -crf 28 -maxrate 1600k -bufsize 3200k -pix_fmt yuv420p \
  -movflags +faststart -map_metadata -1 \
  iced-san-sebastian-pairing-preview.mp4
```

The output is 1,209,347 bytes, 784 × 1168, 24 fps, 6.041667 seconds, H.264
Constrained Baseline level 3.1, YUV420p, fast-start, with one video stream and
no audio. All 145 frames decode. Full-sequence SSIM against the original is
0.967539. The URL revision changes to `v=20261028-1`.

## Regression coverage

- `npm run verify:gallery:assets` now decodes the complete clip and verifies
  frame count and mobile-compatible format; its negative control rejects the
  actual former shipped MP4.
- Gallery mobile CI checks decoded frames after a tap in codec-capable Chrome.
  All four configured mobile profiles exercise HTTP 404, truncated media and
  a request held open. The poster, reserved height and second-tap menu link
  must survive each failure. Screenshots and playback metadata are attached.
- A five-second startup deadline restores the poster if the media engine
  never starts playback or reports an error.
- The gallery matrix runs on PRs and pushes to main. Published smoke checks
  require decoded pairing frames in addition to the existing customer journey.
  PR smoke replays candidate MP4 bytes in the published page, labels its
  evidence accordingly and records the candidate hash. It cannot establish
  publication. Candidate substitution is rejected outside a PR event.
  Main/scheduled/deployment smoke always observes the real served MP4. The
  separate live-integrity gate binds publication bytes to the intended checkout.
  Published browser smoke also waits for this exact-byte check, so the push
  cannot accidentally test the old release while Pages is still deploying.

Local full build/contracts and security checks pass. Initial local Chrome
attempts were blocked before test execution by runtime socket/startup
restrictions. Bundled headless Chromium subsequently ran fault injection:
404/corrupt passed, while the concurrent stalled case exceeded its assertion
deadline and passed in isolation. This is retained as a failed attempt, not an
uninterrupted local matrix pass. This bundled engine lacks H.264 support and
is not the healthy-playback oracle.

At `a84bb1584313af95e989b034d0e33f3cfe5b96f9`, GitHub Actions gallery run
`40761689221` passed the mobile matrix, including real Chrome decoded frames
and all four profiles' failure recovery. Visual run `40761689050` failed
before screenshot capture because FFprobe was absent. The follow-up declares
FFmpeg preparation in every workflow invoking the full source contracts
(visual, causal source-contracts and dependency build-edge jobs). Subsequent
Actions results must be checked against their own exact head. A
physical-device replay remains separate from emulated browser coverage.

The first strict published replay, run `40761689358`, rejected the old live
clip twice: the media clock reached 3.708333 seconds with readyState 4 but
zero decoded frames. That is an independent browser negative control in
addition to FFmpeg. PR replay explicitly uses the candidate media to avoid
requiring an unpublished repair to already exist on Pages; post-deploy smoke
retains the strict real-publication check.
