import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "render-ci-proof-summary.mjs");
const maliciousBranch = "feature/`break`\n<script>alert(1)</script> **bold**";
const maliciousHead = "abc`def<svg>";
const maliciousBlocker = "D4 <img src=x onerror=alert(1)> `escape`";

const result = spawnSync(process.execPath, [SCRIPT], {
  encoding: "utf8",
  env: {
    ...process.env,
    GITHUB_STEP_SUMMARY: "",
    PDG_BRANCH: maliciousBranch,
    PDG_HEAD: maliciousHead,
    PDG_BLOCKER: maliciousBlocker,
    PDG_D4: "pending",
    PDG_D5: "waiting",
    PDG_D6: "waiting"
  }
});

if (result.status !== 0) {
  throw new Error(`summary renderer should pass:\n${result.stderr || result.stdout}`);
}

const output = result.stdout;
for (const unsafe of ["<script>", "<svg>", "<img", "`break`", "`escape`"]) {
  if (output.includes(unsafe)) throw new Error(`unsafe summary token was not escaped: ${unsafe}\n${output}`);
}
for (const escaped of ["&lt;script&gt;", "&lt;svg&gt;", "&lt;img", "&#96;break&#96;", "&#96;escape&#96;"]) {
  if (!output.includes(escaped)) throw new Error(`expected escaped token is missing: ${escaped}\n${output}`);
}
if (!output.includes("feature/&#96;break&#96; &lt;script&gt;alert(1)&lt;/script&gt; **bold**")) {
  throw new Error(`newlines must collapse without changing escaped text:\n${output}`);
}
if (!output.includes("Codex binding; CodeRabbit scheduled reserve; supplemental lanes advisory")) {
  throw new Error(`D4 reviewer roles are stale:\n${output}`);
}
if (output.includes("CodeRabbit binding")) {
  throw new Error(`CodeRabbit must not be rendered as binding:\n${output}`);
}

console.log("✅ PDG summary mutation test passed: metadata is escaped and D4 renders Codex binding with CodeRabbit reserve-only.");
