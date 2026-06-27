# Android and offline acceptance

The release gate verifies one Chromium journey against the current `main` page structure:

- the local Android mark is visible;
- the APK link is prepared and clicked;
- the downloaded file is 25,231 bytes and matches SHA-256 `f188c2f0ab820d514c9c1bd75734e3d76f8203f89d4a1604fd08da43fd7910a6`;
- the service worker controls the site;
- an unknown route returns the branded cached offline/404 page for both network failures and HTTP errors;
- the cached menu opens and remains searchable while offline;
- existing SEO metadata, menu sharing and Instagram booking remain intact.
