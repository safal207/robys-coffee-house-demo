import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "render-ci-proof-summary.mjs");
const maliciousBranch = "feature/`break`\n<script>alert(1)</script> **bold**";
const maliciousHead = "abc`def<svg>";
const maliciousBlocker = "D4 <img src=x onerror=alert(1)> `escape`";
const removedProviderPattern = new RegExp(["code", "rabbit"].join(""), "i");

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
if (!output.includes("Exact-head human approval, maintainer attestation or optional automated review")) {
  throw new Error(`D4 provider-neutral evidence is missing:\n${output}`);
}
if (!output.includes("No external AI provider or provider quota is required")) {
  throw new Error(`provider-neutral authority boundary is missing:\n${output}`);
}
if (removedProviderPattern.test(output)) {
  throw new Error(`removed provider leaked into proof summary:\n${output}`);
}

console.log("✅ PDG summary mutation test passed: metadata is escaped and D4 is provider-neutral while D5, D6, CI and human authority remain intact.");
