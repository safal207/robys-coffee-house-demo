import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const config = JSON.parse(readFileSync("qa/visual-regression.json", "utf8"));
const currentDir = path.resolve(process.env.VISUAL_CURRENT_DIR ?? process.cwd());
const baselineDir = path.resolve(process.env.VISUAL_BASELINE_DIR ?? path.join(process.cwd(), "../baseline"));
const resultsDir = path.resolve(process.env.VISUAL_RESULTS_DIR ?? path.join(process.cwd(), "visual-results"));
const currentPort = Number(process.env.VISUAL_CURRENT_PORT ?? 4173);
const baselinePort = Number(process.env.VISUAL_BASELINE_PORT ?? 4174);
const fixedNow = Date.parse("2026-07-01T12:00:00+03:00");

const output = {
  baseline: path.join(resultsDir, "baseline"),
  current: path.join(resultsDir, "current"),
  diff: path.join(resultsDir, "diff")
};

rmSync(resultsDir, { recursive: true, force: true });
Object.values(output).forEach((directory) => mkdirSync(directory, { recursive: true }));

function startServer(directory, port) {
  const processHandle = spawn(
    "python3",
    ["-m", "http.server", String(port), "--bind", "127.0.0.1"],
    { cwd: directory, stdio: ["ignore", "pipe", "pipe"] }
  );

  let diagnostics = "";
  processHandle.stderr.on("data", (chunk) => {
    diagnostics += chunk.toString();
  });
  processHandle.on("exit", (code) => {
    if (code && code !== 0) console.error(`Static server on ${port} exited with ${code}: ${diagnostics}`);
  });
  return processHandle;
}

async function waitForServer(url, attempts = 40) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError;
}

async function configureVisualContext(context) {
  await context.addInitScript((timestamp) => {
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [timestamp]));
      }
      static now() {
        return timestamp;
      }
    }
    Object.setPrototypeOf(FixedDate, NativeDate);
    globalThis.Date = FixedDate;
    try {
      localStorage.clear();
    } catch {
      // Storage may be unavailable on the initial blank document.
    }
  }, fixedNow);

  await context.route("https://api.open-meteo.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current: {
          temperature_2m: 30,
          precipitation: 0,
          weather_code: 0
        }
      })
    });
  });
}

async function stabilize(page) {
  await page.addStyleTag({
    content: `
      *,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}
      html{scroll-behavior:auto!important;scrollbar-width:none!important}
      html::-webkit-scrollbar,body::-webkit-scrollbar{display:none!important}
      .hero{background:#241c1b url('/src/robys-hero-poster.jpg') center/cover no-repeat!important}
      .hero-video{visibility:hidden!important}
      .map-live-frame{visibility:hidden!important}
      .map-card-live{background:linear-gradient(145deg,#d9d0c7,#b7aaa0)!important}
    `
  });

  await page.evaluate(async () => {
    document.querySelectorAll("video").forEach((video) => {
      video.pause();
      video.currentTime = 0;
    });
    document.querySelectorAll("iframe").forEach((frame) => {
      frame.setAttribute("data-visual-masked", "true");
    });
    const year = document.querySelector("#current-year");
    if (year) year.textContent = "2026";
    if (document.fonts?.ready) await document.fonts.ready;

    const poster = new Image();
    poster.src = "/src/robys-hero-poster.jpg";
    await new Promise((resolve) => {
      if (poster.complete) {
        resolve();
        return;
      }
      poster.addEventListener("load", resolve, { once: true });
      poster.addEventListener("error", resolve, { once: true });
    });
    if (poster.decode) await poster.decode().catch(() => {});

    const galleryTrack = document.querySelector(".featured-track");
    if (galleryTrack) {
      const deadline = performance.now() + 8000;
      while (galleryTrack.getAttribute("data-gallery-ready") !== "true" && performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    const images = Array.from(document.images);
    for (const image of images) {
      image.loading = "eager";
      image.scrollIntoView({ block: "center", inline: "nearest" });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (!image.complete) {
        await new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
      }
      if (image.decode) await image.decode().catch(() => {});
    }

    window.scrollTo(0, 0);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

  await page.waitForTimeout(180);
}

function viewportById(id) {
  const viewport = config.viewports.find((item) => item.id === id);
  if (!viewport) throw new Error(`Unknown visual viewport: ${id}`);
  return viewport;
}

function captureName(capture, viewport) {
  return `${capture.id}__${viewport.id}.png`;
}

async function captureMatrix(browser, baseUrl, destination) {
  const captures = [];

  for (const viewport of config.viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      colorScheme: "light",
      locale: "tr-TR",
      timezoneId: "Europe/Istanbul",
      reducedMotion: "reduce",
      serviceWorkers: "block",
      bypassCSP: true
    });
    await configureVisualContext(context);
    const page = await context.newPage();

    for (const capture of config.captures.filter((item) => item.viewports.includes(viewport.id))) {
      const url = new URL(capture.path, baseUrl);
      url.searchParams.set("visual", `${capture.id}-${viewport.id}`);
      await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30000 });

      if (capture.waitFor) {
        await page.locator(capture.waitFor).first().waitFor({ state: "visible", timeout: 15000 });
      }

      await stabilize(page);
      if (capture.fullPage) {
        await page.addStyleTag({ content: ".mobile-cta{visibility:hidden!important}" });
      }
      const fileName = captureName(capture, viewport);
      const filePath = path.join(destination, fileName);

      if (capture.selector) {
        const locator = page.locator(capture.selector).first();
        await locator.waitFor({ state: "visible", timeout: 10000 });
        await locator.scrollIntoViewIfNeeded();
        await page.waitForTimeout(80);
        await locator.screenshot({ path: filePath, animations: "disabled" });
      } else {
        await page.screenshot({ path: filePath, fullPage: Boolean(capture.fullPage), animations: "disabled" });
      }

      captures.push({ capture, viewport, fileName, filePath });
    }

    await context.close();
  }

  return captures;
}

function compareImages(baselinePath, currentPath, diffPath, maxDiffPixelRatio) {
  const baseline = PNG.sync.read(readFileSync(baselinePath));
  const current = PNG.sync.read(readFileSync(currentPath));

  if (baseline.width !== current.width || baseline.height !== current.height) {
    return {
      passed: false,
      reason: `dimension mismatch ${baseline.width}x${baseline.height} vs ${current.width}x${current.height}`,
      diffPixels: baseline.width * baseline.height,
      diffPixelRatio: 1
    };
  }

  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const diffPixels = pixelmatch(
    baseline.data,
    current.data,
    diff.data,
    baseline.width,
    baseline.height,
    {
      threshold: config.pixelThreshold,
      includeAA: false,
      alpha: 0.65,
      diffColor: [255, 0, 80],
      aaColor: [255, 190, 0]
    }
  );
  const totalPixels = baseline.width * baseline.height;
  const diffPixelRatio = diffPixels / totalPixels;
  const passed = diffPixelRatio <= maxDiffPixelRatio;

  if (!passed) writeFileSync(diffPath, PNG.sync.write(diff));

  return {
    passed,
    diffPixels,
    totalPixels,
    diffPixelRatio,
    maxDiffPixelRatio
  };
}

const currentServer = startServer(currentDir, currentPort);
const baselineServer = startServer(baselineDir, baselinePort);
let browser;

try {
  const currentUrl = `http://127.0.0.1:${currentPort}/`;
  const baselineUrl = `http://127.0.0.1:${baselinePort}/`;
  await Promise.all([waitForServer(currentUrl), waitForServer(baselineUrl)]);

  browser = await chromium.launch({ headless: true });
  const [baselineCaptures, currentCaptures] = await Promise.all([
    captureMatrix(browser, baselineUrl, output.baseline),
    captureMatrix(browser, currentUrl, output.current)
  ]);

  const currentByName = new Map(currentCaptures.map((item) => [item.fileName, item]));
  const results = [];

  for (const baselineCapture of baselineCaptures) {
    const currentCapture = currentByName.get(baselineCapture.fileName);
    if (!currentCapture) throw new Error(`Missing current screenshot: ${baselineCapture.fileName}`);

    const maxDiffPixelRatio = baselineCapture.capture.maxDiffPixelRatio ?? config.defaultMaxDiffPixelRatio;
    const comparison = compareImages(
      baselineCapture.filePath,
      currentCapture.filePath,
      path.join(output.diff, baselineCapture.fileName),
      maxDiffPixelRatio
    );

    results.push({
      id: baselineCapture.capture.id,
      viewport: baselineCapture.viewport.id,
      file: baselineCapture.fileName,
      ...comparison
    });
  }

  const failures = results.filter((result) => !result.passed);
  const summary = {
    generatedAt: new Date().toISOString(),
    baselineDirectory: baselineDir,
    currentDirectory: currentDir,
    pixelThreshold: config.pixelThreshold,
    comparisons: results.length,
    failures: failures.length,
    results
  };
  writeFileSync(path.join(resultsDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

  for (const result of results) {
    const percent = (result.diffPixelRatio * 100).toFixed(4);
    const limit = ((result.maxDiffPixelRatio ?? 0) * 100).toFixed(4);
    console.log(`${result.passed ? "✅" : "❌"} ${result.id} / ${result.viewport}: ${percent}% diff (limit ${limit}%)`);
  }

  if (failures.length) {
    throw new Error(`VISUAL-001 failed for ${failures.length} of ${results.length} screenshot comparisons. Inspect the visual-regression artifact.`);
  }

  console.log(`✅ VISUAL-001 passed: ${results.length} screenshots match the base branch.`);
} finally {
  await browser?.close();
  currentServer.kill("SIGTERM");
  baselineServer.kill("SIGTERM");
}
