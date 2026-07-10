export const ACTIVE_HERO_PATH = "src/robys-ambience-clean.mp4";
export const MIN_FILE_BYTES = 20_000;
export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_DURATION_SECONDS = 8;
export const MAX_EDGE_PIXELS = 1280;
export const MAX_PIXEL_AREA = 1280 * 720;

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
  const classValue = openingTag.match(/\bclass=["']([^"']*)["']/i)?.[1] ?? "";
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
  const sources = Array.from(
    heroBlocks[0].matchAll(/<source\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi),
    (match) => match[1],
  );
  if (sources.length !== 1) {
    throw new Error(`Expected exactly one source inside the hero video in ${context}; found ${sources.length}`);
  }
  return sources[0];
}
