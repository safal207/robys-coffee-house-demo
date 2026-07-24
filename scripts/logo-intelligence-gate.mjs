import { spawn } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const config = JSON.parse(readFileSync(path.join(rootDir, "qa/logo-intelligence.json"), "utf8"));
const resultsDir = path.resolve(
  process.env.LOGO_INTELLIGENCE_RESULTS_DIR ?? path.join(rootDir, "logo-intelligence-results")
);
const port = Number(process.env.LOGO_INTELLIGENCE_PORT ?? 4191);
const baseUrl = `http://127.0.0.1:${port}/`;
const screenshotDir = path.join(resultsDir, "screenshots");

rmSync(resultsDir, { recursive: true, force: true });
mkdirSync(screenshotDir, { recursive: true });

function startServer() {
  const child = spawn(
    "python3",
    ["-m", "http.server", String(port), "--bind", "127.0.0.1"],
    { cwd: rootDir, stdio: ["ignore", "pipe", "pipe"] }
  );
  let diagnostics = "";
  child.stderr.on("data", (chunk) => {
    diagnostics += chunk.toString();
  });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`Logo intelligence server exited with ${code}: ${diagnostics}`);
    }
  });
  return child;
}

async function waitForServer(attempts = 40) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(baseUrl, { cache: "no-store" });
      if (response.ok) return;
      lastError = new Error(`${baseUrl} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError;
}

function parseViewBox(svg) {
  const match = svg.match(/\bviewBox=["']([^"']+)["']/i);
  if (!match) return null;
  const values = match[1].trim().split(/[\s,]+/).map(Number);
  return values.length === 4 && values.every(Number.isFinite) ? values : null;
}

function sameNumbers(actual, expected, tolerance = 0.001) {
  return Boolean(
    actual &&
      actual.length === expected.length &&
      actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance)
  );
}

function validateAssets() {
  return config.assets.map((asset) => {
    const source = readFileSync(path.join(rootDir, asset.path), "utf8");
    const vectorNodes = (source.match(/<(?:path|ellipse|circle|rect|use)\b/gi) ?? []).length;
    const findings = [];

    if (!sameNumbers(parseViewBox(source), asset.viewBox)) {
      findings.push(`viewBox must remain ${asset.viewBox.join(" ")}`);
    }
    if (vectorNodes < asset.minVectorNodes) {
      findings.push(`vector node count ${vectorNodes} is below ${asset.minVectorNodes}`);
    }
    if (/<(?:text|image|foreignObject)\b/i.test(source)) {
      findings.push("master must remain self-contained vector geometry");
    }
    if (/font-family\s*=|font-family\s*:/i.test(source)) {
      findings.push("master must not depend on browser fonts");
    }
    if (/href=["']https?:/i.test(source)) {
      findings.push("master must not load external resources");
    }
    if (!/role=["']img["']/i.test(source) || !/<title\b/i.test(source) || !/<desc\b/i.test(source)) {
      findings.push("master must keep role, title and description semantics");
    }
    if (!source.toUpperCase().includes(config.brandRed.toUpperCase())) {
      findings.push(`master must contain brand red ${config.brandRed}`);
    }

    return {
      id: asset.id,
      path: asset.path,
      vectorNodes,
      passed: findings.length === 0,
      findings
    };
  });
}

function parseBackgroundUrl(backgroundImage) {
  const match = backgroundImage.match(/url\(["']?([^"')]+)["']?\)/i);
  return match?.[1] ?? null;
}

function analyzePixels(filePath) {
  const png = PNG.sync.read(readFileSync(filePath));
  const totalPixels = png.width * png.height;
  let darkPixels = 0;
  let redPixels = 0;
  let inkPixels = 0;
  let edgeInkPixels = 0;
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  const edgeBand = Math.max(1, Math.round(Math.min(png.width, png.height) * 0.025));

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const offset = (y * png.width + x) * 4;
      const r = png.data[offset];
      const g = png.data[offset + 1];
      const b = png.data[offset + 2];
      const alpha = png.data[offset + 3];
      if (alpha < 20) continue;

      const dark = r < 105 && g < 105 && b < 105;
      const red = r > 145 && r > g * 1.45 && r > b * 1.25;
      if (dark) darkPixels += 1;
      if (red) redPixels += 1;
      if (!dark && !red) continue;

      inkPixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (
        x < edgeBand ||
        y < edgeBand ||
        x >= png.width - edgeBand ||
        y >= png.height - edgeBand
      ) {
        edgeInkPixels += 1;
      }
    }
  }

  if (inkPixels === 0) {
    return {
      width: png.width,
      height: png.height,
      inkRatio: 0,
      redRatio: 0,
      darkRatio: 0,
      edgeInkRatio: 1,
      occupiedWidthRatio: 0,
      occupiedHeightRatio: 0,
      horizontalImbalanceRatio: 1,
      margins: null
    };
  }

  const margins = {
    left: minX,
    right: png.width - 1 - maxX,
    top: minY,
    bottom: png.height - 1 - maxY
  };

  return {
    width: png.width,
    height: png.height,
    inkRatio: inkPixels / totalPixels,
    redRatio: redPixels / totalPixels,
    darkRatio: darkPixels / totalPixels,
    edgeInkRatio: edgeInkPixels / inkPixels,
    occupiedWidthRatio: (maxX - minX + 1) / png.width,
    occupiedHeightRatio: (maxY - minY + 1) / png.height,
    horizontalImbalanceRatio: Math.abs(margins.left - margins.right) / png.width,
    margins
  };
}

function within(value, min, max) {
  return value >= min && value <= max;
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

async function evaluateScenario(browser, scenario) {
  const context = await browser.newContext({
    viewport: scenario.viewport,
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    bypassCSP: true
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const url = new URL(scenario.path, baseUrl);
  url.searchParams.set("logo-intelligence", scenario.id);
  await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.addStyleTag({
    content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}"
  });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

  const locator = page.locator(scenario.selector).first();
  await locator.waitFor({ state: "visible", timeout: 15_000 });
  const dom = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const parentRect = element.parentElement?.getBoundingClientRect() ?? rect;
    const style = getComputedStyle(element);
    return {
      rect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      },
      parentRect: {
        left: parentRect.left,
        top: parentRect.top,
        right: parentRect.right,
        bottom: parentRect.bottom,
        width: parentRect.width,
        height: parentRect.height
      },
      backgroundImage: style.backgroundImage,
      backgroundSize: style.backgroundSize,
      backgroundPosition: style.backgroundPosition,
      display: style.display,
      visibility: style.visibility,
      opacity: Number(style.opacity)
    };
  });

  const assetUrl = parseBackgroundUrl(dom.backgroundImage);
  const assetResponse = assetUrl
    ? await page.evaluate(async (resourceUrl) => {
        try {
          const response = await fetch(resourceUrl, { cache: "no-store" });
          return {
            ok: response.ok,
            status: response.status,
            contentType: response.headers.get("content-type") ?? ""
          };
        } catch (error) {
          return { ok: false, status: 0, contentType: "", error: String(error) };
        }
      }, assetUrl)
    : { ok: false, status: 0, contentType: "", error: "missing background URL" };

  const screenshotPath = path.join(screenshotDir, `${scenario.id}.png`);
  await locator.screenshot({ path: screenshotPath, animations: "disabled" });
  const pixels = analyzePixels(screenshotPath);
  const thresholds = config.pixelThresholds;
  const tolerance = 1.5;
  const viewportContained =
    dom.rect.left >= -tolerance &&
    dom.rect.top >= -tolerance &&
    dom.rect.right <= scenario.viewport.width + tolerance &&
    dom.rect.bottom <= scenario.viewport.height + tolerance;
  const parentContained =
    dom.rect.left >= dom.parentRect.left - tolerance &&
    dom.rect.top >= dom.parentRect.top - tolerance &&
    dom.rect.right <= dom.parentRect.right + tolerance &&
    dom.rect.bottom <= dom.parentRect.bottom + tolerance;
  const expectedAssetLoaded = Boolean(assetUrl?.includes(scenario.expectedAsset));
  const sizePassed =
    within(dom.rect.width, scenario.size.minWidth, scenario.size.maxWidth) &&
    within(dom.rect.height, scenario.size.minHeight, scenario.size.maxHeight);

  const findings = [];
  const warnings = [];
  if (!expectedAssetLoaded) findings.push(`expected ${scenario.expectedAsset}, got ${assetUrl ?? "no asset"}`);
  if (!assetResponse.ok || !assetResponse.contentType.includes("svg")) {
    findings.push(`logo asset request failed (${assetResponse.status || "no status"})`);
  }
  if (!viewportContained) findings.push("logo escapes the viewport");
  if (!parentContained) findings.push("logo is clipped by or escapes its immediate container");
  if (!sizePassed) {
    findings.push(
      `rendered size ${round(dom.rect.width, 1)}x${round(dom.rect.height, 1)} is outside the approved range`
    );
  }
  if (dom.visibility !== "visible" || dom.opacity < 0.95 || dom.display === "none") {
    findings.push("logo is not fully visible");
  }
  if (pixels.inkRatio < thresholds.minInkRatio) findings.push("wordmark ink density is too low");
  if (pixels.redRatio < thresholds.minRedRatio) findings.push("organic red O is missing or too faint");
  if (pixels.edgeInkRatio > thresholds.maxEdgeInkRatio) findings.push("logo geometry touches the screenshot edge");
  if (pixels.occupiedWidthRatio < thresholds.minOccupiedWidthRatio) findings.push("wordmark occupies too little horizontal space");
  if (pixels.occupiedHeightRatio < thresholds.minOccupiedHeightRatio) findings.push("wordmark occupies too little vertical space");
  if (pixels.horizontalImbalanceRatio > thresholds.maxHorizontalImbalanceRatio) {
    warnings.push("left/right optical whitespace is imbalanced");
  }
  if (pageErrors.length) warnings.push(`${pageErrors.length} unrelated page error(s) observed`);

  const loadScore = (expectedAssetLoaded ? 12 : 0) + (assetResponse.ok ? 13 : 0);
  const containmentScore =
    (viewportContained ? 8 : 0) + (parentContained ? 8 : 0) + (sizePassed ? 9 : 0);
  const brandScore =
    (pixels.inkRatio >= thresholds.minInkRatio ? 8 : 0) +
    (pixels.redRatio >= thresholds.minRedRatio ? 10 : 0) +
    (pixels.darkRatio >= thresholds.minInkRatio * 0.6 ? 7 : 0);
  const opticalScore =
    (pixels.edgeInkRatio <= thresholds.maxEdgeInkRatio ? 9 : 0) +
    (pixels.occupiedWidthRatio >= thresholds.minOccupiedWidthRatio ? 6 : 0) +
    (pixels.occupiedHeightRatio >= thresholds.minOccupiedHeightRatio ? 5 : 0) +
    (pixels.horizontalImbalanceRatio <= thresholds.maxHorizontalImbalanceRatio ? 5 : 0);
  const score = loadScore + containmentScore + brandScore + opticalScore;
  const passed = findings.length === 0 && score >= config.scoreThreshold;

  await context.close();
  return {
    id: scenario.id,
    path: scenario.path,
    selector: scenario.selector,
    viewport: scenario.viewport,
    expectedAsset: scenario.expectedAsset,
    assetUrl,
    assetResponse,
    renderedSize: {
      width: round(dom.rect.width, 1),
      height: round(dom.rect.height, 1)
    },
    pixels: Object.fromEntries(
      Object.entries(pixels).map(([key, value]) => [key, typeof value === "number" ? round(value) : value])
    ),
    score,
    passed,
    findings,
    warnings,
    screenshot: path.relative(resultsDir, screenshotPath)
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function createContactSheet(browser, scenarios) {
  const cards = scenarios
    .map((scenario) => {
      const image = readFileSync(path.join(resultsDir, scenario.screenshot)).toString("base64");
      const findings = scenario.findings.length
        ? `<ul>${scenario.findings.map((finding) => `<li>${escapeHtml(finding)}</li>`).join("")}</ul>`
        : "<p>No blocking findings.</p>";
      return `
        <article class="card ${scenario.passed ? "pass" : "fail"}">
          <header><strong>${escapeHtml(scenario.id)}</strong><span>${scenario.score}/100</span></header>
          <div class="meta">${scenario.viewport.width}×${scenario.viewport.height} · ${escapeHtml(scenario.expectedAsset)}</div>
          <div class="stage"><img src="data:image/png;base64,${image}" alt="${escapeHtml(scenario.id)}"></div>
          ${findings}
        </article>`;
    })
    .join("");
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:28px;background:#f2eee9;color:#171311;font-family:Arial,sans-serif}
    h1{margin:0 0 8px;font-size:28px}.subtitle{margin:0 0 24px;color:#655b55}
    main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
    .card{background:#fff;border:2px solid #d7cec7;border-radius:18px;padding:16px;box-shadow:0 10px 28px rgba(45,32,25,.08)}
    .card.pass{border-color:#71a878}.card.fail{border-color:#d35b5b}
    header{display:flex;justify-content:space-between;gap:16px;font-size:17px}.meta{margin:6px 0 14px;color:#756a64;font-size:13px}
    .stage{min-height:150px;display:grid;place-items:center;border-radius:12px;background:linear-gradient(135deg,#fff,#ece5df);padding:18px;overflow:hidden}
    img{max-width:100%;height:auto;image-rendering:auto}ul,p{margin:12px 0 0;font-size:13px;line-height:1.4}ul{padding-left:20px}
  </style></head><body><h1>Robis Logo Intelligence Gate</h1><p class="subtitle">Geometry, asset loading, brand signal, optical whitespace and responsive containment.</p><main>${cards}</main></body></html>`);
  await page.screenshot({ path: path.join(resultsDir, "logo-contact-sheet.png"), fullPage: true });
  await page.close();
}

function writeReports(assetResults, scenarioResults) {
  const passed = assetResults.every((result) => result.passed) && scenarioResults.every((result) => result.passed);
  const report = {
    version: config.version,
    generatedAt: new Date().toISOString(),
    passed,
    scoreThreshold: config.scoreThreshold,
    assets: assetResults,
    scenarios: scenarioResults
  };
  writeFileSync(path.join(resultsDir, "logo-design-report.json"), `${JSON.stringify(report, null, 2)}\n`);

  const lines = [
    "# Robis Logo Intelligence Gate",
    "",
    `Overall: ${passed ? "✅ PASS" : "❌ FAIL"}`,
    "",
    "## Responsive design matrix",
    "",
    "| Scenario | Score | Result | Rendered asset | Findings |",
    "|---|---:|:---:|---|---|"
  ];
  for (const scenario of scenarioResults) {
    lines.push(
      `| ${scenario.id} | ${scenario.score}/100 | ${scenario.passed ? "✅" : "❌"} | ${scenario.expectedAsset} | ${scenario.findings.join("; ") || "—"} |`
    );
  }
  lines.push("", "## SVG master contract", "", "| Asset | Vector nodes | Result | Findings |", "|---|---:|:---:|---|");
  for (const asset of assetResults) {
    lines.push(
      `| ${asset.id} | ${asset.vectorNodes} | ${asset.passed ? "✅" : "❌"} | ${asset.findings.join("; ") || "—"} |`
    );
  }
  lines.push(
    "",
    "The gate produces `logo-design-report.json`, `logo-design-report.md`, individual screenshots and `logo-contact-sheet.png`. Automated scores are evidence only; they do not approve a new visual baseline or authorize merge.",
    ""
  );
  writeFileSync(path.join(resultsDir, "logo-design-report.md"), `${lines.join("\n")}\n`);
  return passed;
}

const server = startServer();
let browser;
try {
  await waitForServer();
  const assetResults = validateAssets();
  browser = await chromium.launch({ headless: true });
  const scenarioResults = [];
  for (const scenario of config.scenarios) {
    scenarioResults.push(await evaluateScenario(browser, scenario));
  }
  await createContactSheet(browser, scenarioResults);
  const passed = writeReports(assetResults, scenarioResults);
  console.log(readFileSync(path.join(resultsDir, "logo-design-report.md"), "utf8"));
  if (!passed) process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
