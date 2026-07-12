import { readFileSync } from "node:fs";

export const MIN_FILE_BYTES = 20_000;
export const MAX_FILE_BYTES = 256_000;
export const MAX_DURATION_SECONDS = 8;
export const MAX_EDGE_PIXELS = 1280;
export const MAX_PIXEL_AREA = 1280 * 720;
export const TRUSTED_HERO_PATH = "src/robys-ambience-clean.mp4";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function attributeValue(openingTag, attributeName) {
  const escaped = escapeRegex(attributeName);
  const match = openingTag.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match?.[2] ?? null;
}

export function decodeHtmlAttribute(value) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#0*38;/gi, "&")
    .replace(/&#x0*26;/gi, "&");
}

export function safeDecodeURIComponent(value, context) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(`Invalid URL encoding in ${context}: ${value}`);
  }
}

export function fetchReference(reference, context) {
  return safeDecodeURIComponent(decodeHtmlAttribute(reference).split("#")[0], context);
}

export function fileReference(reference, context) {
  return fetchReference(reference, context).split("?")[0];
}

export function hasClassToken(openingTag, token) {
  const classValue = attributeValue(openingTag, "class") ?? "";
  return classValue.split(/\s+/).filter(Boolean).includes(token);
}

export function extractSingleHeroVideoSource(html, context = "HTML") {
  const videoBlocks = Array.from(
    html.matchAll(/<video\b[^>]*>[\s\S]*?<\/video>/gi),
    (match) => match[0],
  );
  const heroBlocks = videoBlocks.filter((block) => {
    const openingTag = block.match(/^<video\b[^>]*>/i)?.[0] ?? "";
    return hasClassToken(openingTag, "hero-video");
  });
  if (heroBlocks.length !== 1) {
    throw new Error(`Expected exactly one hero video block in ${context}; found ${heroBlocks.length}`);
  }

  const sourceTags = Array.from(heroBlocks[0].matchAll(/<source\b[^>]*>/gi), (match) => match[0]);
  const sources = sourceTags
    .map((tag) => attributeValue(tag, "src"))
    .filter((value) => value !== null);
  if (sources.length !== 1) {
    throw new Error(`Expected exactly one source inside the hero video in ${context}; found ${sources.length}`);
  }
  return sources[0];
}

const indexHtml = readFileSync("index.html", "utf8");
const derivedHeroFetch = fetchReference(extractSingleHeroVideoSource(indexHtml, "index.html"), "index.html hero source");
const derivedHeroPath = fileReference(derivedHeroFetch, "index.html hero source");
if (derivedHeroPath !== TRUSTED_HERO_PATH) {
  throw new Error(`Active hero path is outside the trusted allowlist: ${derivedHeroPath || "missing"}`);
}
if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(derivedHeroFetch)) {
  throw new Error(`Active hero must remain a repository-relative asset: ${derivedHeroFetch}`);
}

export const ACTIVE_HERO_FETCH = derivedHeroFetch;
export const ACTIVE_HERO_PATH = TRUSTED_HERO_PATH;
