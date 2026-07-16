"use strict";

const fs = require("node:fs");
const { _test } = require("./verify-ai-review-contract.cjs");

const { selectRequiredEvidence } = _test;
const READY_RE = /\*\*Overall conclusion:\*\*\s*\*\*(READY|READY_WITH_ADVISORY_GAPS)\*\*/;
const WHY_RE = /\*\*Why:\*\*[^\n]*/;
const SELECTION_MARKER = "### Active provider selection";

function parseTime(value) {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function headCommitTime(headCommit) {
  return parseTime(
    headCommit?.commit?.committer?.date ??
      headCommit?.commit?.author?.date ??
      "",
  );
}

function enforceSelection({
  pr,
  headCommit,
  comments,
  reviews,
  body,
  triggerEvent,
  workflowCreatedAt = "",
  now = Date.now(),
}) {
  const currentHead = pr?.head?.sha?.toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(currentHead ?? "")) {
    throw new Error("cooperation selection guard requires a valid current PR head");
  }

  const workflowAnchor = parseTime(workflowCreatedAt);
  const headAnchor = headCommitTime(headCommit);
  const anchor = triggerEvent === "workflow_run" ? workflowAnchor : headAnchor;
  if (anchor <= 0) {
    throw new Error("cooperation selection guard requires a stable freshness anchor");
  }

  const selection = selectRequiredEvidence({
    comments,
    reviews,
    currentHead,
    headUpdateAnchor: anchor,
    now,
  });

  // Only a successful trusted target workflow may authorize Codex fallback.
  // Manual/report and review-triggered refreshes may publish READY only for Qodo primary.
  const selectedProvider = triggerEvent === "workflow_run"
    ? selection.provider
    : selection.provider === "Qodo"
      ? "Qodo"
      : null;
  const selectedMode = selectedProvider ? selection.mode : "pending";
  const primaryFailure = selection.primaryFailure ?? "unknown";
  const requested = selection.requestedProviders?.join(", ") || "none";
  const unavailable = selection.unavailableProviders?.join(", ") || "none";
  const selectionSection = [
    SELECTION_MARKER,
    "",
    `- Selected provider: **${selectedProvider ?? "none"}**`,
    `- Selection mode: **${selectedMode}**`,
    `- Primary state: \`${primaryFailure}\``,
    `- Active requests: ${requested}`,
    `- Unavailable providers: ${unavailable}`,
    `- Freshness anchor: \`${new Date(anchor).toISOString()}\``,
    "",
  ].join("\n");

  let guardedBody = String(body ?? "");
  if (!guardedBody.includes("<!-- ai-review-cooperation -->")) {
    throw new Error("cooperation selection guard received an untrusted report body");
  }

  if (READY_RE.test(guardedBody) && !selectedProvider) {
    guardedBody = guardedBody.replace(
      READY_RE,
      "**Overall conclusion:** **WAIT_FOR_EVIDENCE**",
    );
    guardedBody = guardedBody.replace(
      WHY_RE,
      "**Why:** Qodo primary evidence is missing and the authoritative Qodo-to-Codex failover selector has not accepted a fallback.",
    );
  }

  if (!guardedBody.includes(SELECTION_MARKER)) {
    const insertionPoint = guardedBody.indexOf("### Evidence summary");
    guardedBody = insertionPoint >= 0
      ? `${guardedBody.slice(0, insertionPoint)}${selectionSection}\n${guardedBody.slice(insertionPoint)}`
      : `${guardedBody.trimEnd()}\n\n${selectionSection}`;
  }

  return { body: guardedBody, selection, selectedProvider, selectedMode };
}

function readJsonEnv(name) {
  const file = process.env[name]?.trim();
  if (!file) throw new Error(`missing required environment variable: ${name}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function main() {
  const commentFile = process.env.COMMENT_FILE?.trim();
  if (!commentFile) throw new Error("missing required environment variable: COMMENT_FILE");
  const payload = JSON.parse(fs.readFileSync(commentFile, "utf8"));
  const result = enforceSelection({
    pr: readJsonEnv("PR_JSON_FILE"),
    headCommit: readJsonEnv("HEAD_COMMIT_FILE"),
    comments: readJsonEnv("COMMENTS_FILE"),
    reviews: readJsonEnv("REVIEWS_FILE"),
    body: payload.body,
    triggerEvent: process.env.TRIGGER_EVENT?.trim() || "",
    workflowCreatedAt: process.env.WORKFLOW_CREATED_AT?.trim() || "",
  });
  fs.writeFileSync(commentFile, `${JSON.stringify({ body: result.body })}\n`, "utf8");
  console.log(
    `cooperation selection guard: provider=${result.selectedProvider ?? "none"} mode=${result.selectedMode} primary_failure=${result.selection.primaryFailure}`,
  );
}

if (require.main === module) main();

module.exports = { enforceSelection, headCommitTime, parseTime };
