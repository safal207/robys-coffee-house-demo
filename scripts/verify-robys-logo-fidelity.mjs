#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";
import pixelmatch from "pixelmatch";
import sharp from "sharp";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`Invalid argument near ${key}`);
    args[key.slice(2)] = value;
  }
  return args;
}

async function decodeReference(config, outputDir) {
  const encoded = (await fs.readFile(config.reference.base64_path, "utf8")).trim();
  const bytes = Buffer.from(encoded, "base64");
  assert.equal(sha256(bytes), config.reference.sha256, "reference SHA-256 must match the reviewed artifact");
  const output = path.join(outputDir, "reference.png");
  await fs.writeFile(output, bytes);
  return output;
}

function isLogoPixel(r, g, b, a = 255) {
  if (a < 48) return false;
  const dark = r < 155 && g < 155 && b < 155;
  const red = r > 120 && r > g * 1.25 && r > b * 1.25;
  return dark || red;
}

async function readMask(imagePath) {
  const { data, info } = await sharp(imagePath)
    .flatten({ background: "#ffffff" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(info.width * info.height);
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4;
    mask[index] = isLogoPixel(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]) ? 1 : 0;
  }
  return { mask, width: info.width, height: info.height };
}

function connectedComponents({ mask, width, height }) {
  const visited = new Uint8Array(mask.length);
  const components = [];
  const queueX = new Int32Array(mask.length);
  const queueY = new Int32Array(mask.length);
  const minArea = Math.max(20, Math.floor(width * height * 0.00004));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const origin = y * width + x;
      if (!mask[origin] || visited[origin]) continue;
      let head = 0;
      let tail = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;
      queueX[tail] = x;
      queueY[tail] = y;
      tail += 1;
      visited[origin] = 1;
      while (head < tail) {
        const cx = queueX[head];
        const cy = queueY[head];
        head += 1;
        area += 1;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dy) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const next = ny * width + nx;
            if (!mask[next] || visited[next]) continue;
            visited[next] = 1;
            queueX[tail] = nx;
            queueY[tail] = ny;
            tail += 1;
          }
        }
      }
      if (area >= minArea) {
        components.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, area });
      }
    }
  }
  return components;
}

function selectRobysGlyphs(maskInfo, order) {
  const components = connectedComponents(maskInfo);
  assert(components.length >= order.length, "render must expose enough connected components for ROBY'S");
  const maxHeight = Math.max(...components.map((item) => item.height));
  const row = components
    .filter((item) => item.y < maskInfo.height * 0.72 && item.height >= maxHeight * 0.62)
    .sort((a, b) => a.x - b.x)
    .slice(0, order.length);
  assert.equal(row.length, order.length, "must identify R/O/B/Y/S as the first primary-row glyphs");
  return Object.fromEntries(order.map((glyph, index) => [glyph, row[index]]));
}

function cropMask(maskInfo, box) {
  const output = new Uint8Array(box.width * box.height);
  for (let y = 0; y < box.height; y += 1) {
    const sourceOffset = (box.y + y) * maskInfo.width + box.x;
    output.set(maskInfo.mask.subarray(sourceOffset, sourceOffset + box.width), y * box.width);
  }
  return { mask: output, width: box.width, height: box.height };
}

function resizeMaskNearest(maskInfo, targetWidth = 256, targetHeight = 256) {
  const output = new Uint8Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(maskInfo.height - 1, Math.floor((y * maskInfo.height) / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(maskInfo.width - 1, Math.floor((x * maskInfo.width) / targetWidth));
      output[y * targetWidth + x] = maskInfo.mask[sourceY * maskInfo.width + sourceX];
    }
  }
  return output;
}

function diceScore(left, right) {
  let leftArea = 0;
  let rightArea = 0;
  let intersection = 0;
  for (let index = 0; index < left.length; index += 1) {
    leftArea += left[index];
    rightArea += right[index];
    intersection += left[index] && right[index] ? 1 : 0;
  }
  return leftArea + rightArea === 0 ? 1 : (2 * intersection) / (leftArea + rightArea);
}

function boxUnion(boxes) {
  const values = Object.values(boxes);
  const left = Math.min(...values.map((item) => item.x));
  const top = Math.min(...values.map((item) => item.y));
  const right = Math.max(...values.map((item) => item.x + item.width));
  const bottom = Math.max(...values.map((item) => item.y + item.height));
  return { left, top, width: right - left, height: bottom - top };
}

function geometryMetrics(glyphs) {
  const anchors = [glyphs.R, glyphs.B, glyphs.Y];
  const cap = anchors.reduce((sum, item) => sum + item.y, 0) / anchors.length;
  const baseline = anchors.reduce((sum, item) => sum + item.y + item.height, 0) / anchors.length;
  const capHeight = baseline - cap;
  return {
    cap,
    baseline,
    cap_height: capHeight,
    b_cap_deviation_ratio: Math.abs(glyphs.B.y - cap) / capHeight,
    b_baseline_deviation_ratio: Math.abs(glyphs.B.y + glyphs.B.height - baseline) / capHeight,
    s_top_overshoot_ratio: Math.max(0, cap - glyphs.S.y) / capHeight,
    s_bottom_overshoot_ratio: Math.max(0, glyphs.S.y + glyphs.S.height - baseline) / capHeight,
  };
}

async function normalizeWordmark(imagePath, glyphs, outputPath) {
  const union = boxUnion(glyphs);
  await sharp(imagePath)
    .extract(union)
    .flatten({ background: "#ffffff" })
    .resize(1200, 360, { fit: "fill" })
    .png()
    .toFile(outputPath);
}

async function compareNormalized(referencePath, actualPath, diffPath) {
  const left = await sharp(referencePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const right = await sharp(actualPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(left.info.width, right.info.width);
  assert.equal(left.info.height, right.info.height);
  const diff = Buffer.alloc(left.data.length);
  const mismatched = pixelmatch(left.data, right.data, diff, left.info.width, left.info.height, {
    threshold: 0.20,
    includeAA: false,
    alpha: 0.6,
    diffColor: [255, 0, 255],
  });
  await sharp(diff, { raw: left.info }).png().toFile(diffPath);
  return mismatched / (left.info.width * left.info.height);
}

async function comparisonBoard(referencePath, actualPath, diffPath, outputPath, title) {
  const width = 1200;
  const panelHeight = 360;
  const labelHeight = 52;
  const height = (panelHeight + labelHeight) * 3;
  const labels = ["REFERENCE", "BROWSER RENDER", "PIXEL DIFF"];
  const images = [referencePath, actualPath, diffPath];
  const composite = [];
  for (let index = 0; index < images.length; index += 1) {
    const top = index * (panelHeight + labelHeight);
    const label = Buffer.from(`<svg width="${width}" height="${labelHeight}"><rect width="100%" height="100%" fill="#ffffff"/><text x="24" y="36" font-size="26" font-family="Arial, sans-serif" font-weight="700" fill="#111111">${title} · ${labels[index]}</text></svg>`);
    composite.push({ input: label, top, left: 0 });
    composite.push({ input: images[index], top: top + labelHeight, left: 0 });
  }
  await sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).composite(composite).png().toFile(outputPath);
}

async function capture(browser, config, profile, outputDir) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.device_scale_factor,
    isMobile: profile.id === "mobile",
    hasTouch: profile.id === "mobile",
  });
  const page = await context.newPage();
  await page.goto(config.target.url, { waitUntil: "networkidle", timeout: 60_000 });
  const locator = page.locator(config.target.selector);
  await locator.waitFor({ state: "visible", timeout: 20_000 });
  await sleep(300);
  const actualPath = path.join(outputDir, `${profile.id}-actual.png`);
  await locator.screenshot({ path: actualPath, animations: "disabled" });
  const computed = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      background_image: style.backgroundImage,
      background_size: style.backgroundSize,
      background_position: style.backgroundPosition,
    };
  });
  await context.close();
  return { actualPath, computed };
}

async function analyzeProfile(config, profile, referencePath, referenceMask, referenceGlyphs, browser, outputDir) {
  const { actualPath, computed } = await capture(browser, config, profile, outputDir);
  const actualMask = await readMask(actualPath);
  const actualGlyphs = selectRobysGlyphs(actualMask, config.glyph_order);
  const scores = {};
  for (const glyph of config.glyph_order) {
    const expected = resizeMaskNearest(cropMask(referenceMask, referenceGlyphs[glyph]));
    const actual = resizeMaskNearest(cropMask(actualMask, actualGlyphs[glyph]));
    scores[glyph] = diceScore(expected, actual);
  }

  const referenceNormalized = path.join(outputDir, `${profile.id}-reference-normalized.png`);
  const actualNormalized = path.join(outputDir, `${profile.id}-actual-normalized.png`);
  const diffPath = path.join(outputDir, `${profile.id}-diff.png`);
  const boardPath = path.join(outputDir, `${profile.id}-comparison-board.png`);
  await normalizeWordmark(referencePath, referenceGlyphs, referenceNormalized);
  await normalizeWordmark(actualPath, actualGlyphs, actualNormalized);
  const mismatchRatio = await compareNormalized(referenceNormalized, actualNormalized, diffPath);
  await comparisonBoard(referenceNormalized, actualNormalized, diffPath, boardPath, profile.id.toUpperCase());

  const geometry = geometryMetrics(actualGlyphs);
  const failures = [];
  for (const glyph of config.glyph_order) {
    if (scores[glyph] < config.minimum_dice[glyph]) failures.push(`${glyph} Dice ${scores[glyph].toFixed(4)} < ${config.minimum_dice[glyph]}`);
  }
  if (geometry.b_cap_deviation_ratio > config.maximum_baseline_deviation_ratio) failures.push("B cap-height deviates from R/Y grid");
  if (geometry.b_baseline_deviation_ratio > config.maximum_baseline_deviation_ratio) failures.push("B baseline deviates from R/Y grid");
  if (geometry.s_top_overshoot_ratio > config.maximum_s_overshoot_ratio) failures.push("S top overshoot exceeds optical allowance");
  if (geometry.s_bottom_overshoot_ratio > config.maximum_s_overshoot_ratio) failures.push("S bottom overshoot exceeds optical allowance");
  if (mismatchRatio > config.maximum_normalized_pixel_mismatch_ratio) failures.push(`normalized mismatch ${mismatchRatio.toFixed(4)} exceeds limit`);

  return {
    profile: profile.id,
    computed_style: computed,
    glyph_dice: scores,
    geometry,
    normalized_pixel_mismatch_ratio: mismatchRatio,
    failures,
    artifacts: {
      actual: path.basename(actualPath),
      reference_normalized: path.basename(referenceNormalized),
      actual_normalized: path.basename(actualNormalized),
      diff: path.basename(diffPath),
      comparison_board: path.basename(boardPath),
    },
  };
}

function renderSummary(packet) {
  const lines = [
    "# Roby's logo fidelity audit v0.1",
    "",
    `**Verdict:** \`${packet.verdict}\`  `,
    `**Source head:** \`${packet.source_identity.head_sha}\`  `,
    `**Reference SHA-256:** \`${packet.reference.sha256}\``,
    "",
    "| Profile | R | O | B | Y | S | Pixel mismatch | Result |",
    "|---|---:|---:|---:|---:|---:|---:|---|",
  ];
  for (const result of packet.results) {
    const s = result.glyph_dice;
    lines.push(`| ${result.profile} | ${s.R.toFixed(3)} | ${s.O.toFixed(3)} | **${s.B.toFixed(3)}** | ${s.Y.toFixed(3)} | ${s.S.toFixed(3)} | ${result.normalized_pixel_mismatch_ratio.toFixed(3)} | ${result.failures.length ? "FAIL" : "PASS"} |`);
  }
  lines.push("", "## Boundary", "", "> This gate confirms visual and structural similarity to the reviewed reference. It does not establish trademark ownership and does not authorize merge or deployment.", "");
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const key of ["config", "chrome", "output-dir"]) if (!args[key]) throw new Error(`--${key} is required`);
  const config = JSON.parse(await fs.readFile(args.config, "utf8"));
  assert.equal(config.schema_version, "robys-logo-fidelity-v0.1");
  assert.equal(config.authority.merge, false);
  assert.equal(config.authority.deployment, false);
  const outputDir = args["output-dir"];
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  const referencePath = await decodeReference(config, outputDir);
  const referenceMask = await readMask(referencePath);
  const referenceGlyphs = selectRobysGlyphs(referenceMask, config.glyph_order);
  const browser = await chromium.launch({ executablePath: args.chrome, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const results = [];
  try {
    for (const profile of config.profiles) results.push(await analyzeProfile(config, profile, referencePath, referenceMask, referenceGlyphs, browser, outputDir));
  } finally {
    await browser.close();
  }

  const failures = results.flatMap((result) => result.failures.map((failure) => `${result.profile}: ${failure}`));
  const packet = {
    schema_version: "robys-logo-fidelity-result-v0.1",
    generated_at: new Date().toISOString(),
    reference: config.reference,
    source_identity: {
      head_sha: process.env.GITHUB_HEAD_SHA || process.env.GITHUB_SHA || "local",
      run_id: process.env.GITHUB_RUN_ID || null,
      run_attempt: process.env.GITHUB_RUN_ATTEMPT || null,
    },
    verdict: failures.length ? "FIDELITY_FAIL" : "READY_FOR_HUMAN_REVIEW",
    results,
    failures,
    authority: config.authority,
  };
  await fs.writeFile(path.join(outputDir, "result.json"), `${JSON.stringify(packet, null, 2)}\n`);
  const summary = renderSummary(packet);
  await fs.writeFile(path.join(outputDir, "summary.md"), summary);
  console.log(summary);
  if (failures.length) throw new Error(`Logo fidelity gate failed:\n- ${failures.join("\n- ")}`);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
