import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { provisionUser } from "./store.mjs";

function hiddenPassword(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Run provisioning in an interactive terminal; passwords are never accepted as arguments");
  return new Promise((resolvePassword, reject) => {
    let password = "";
    process.stdout.write(label);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const finish = (error) => {
      process.stdin.off("data", input);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error); else resolvePassword(password);
    };
    const input = value => {
      for (const character of value) {
        if (character === "\u0003" || character === "\u0004") { finish(new Error("Provisioning cancelled")); return; }
        if (character === "\r" || character === "\n") { finish(); return; }
        if (character === "\u007f" || character === "\b") password = Array.from(password).slice(0, -1).join("");
        else if (character >= " " && password.length < 256) password += character;
      }
    };
    process.stdin.on("data", input);
  });
}

try {
  const [username, role, ...extra] = process.argv.slice(2);
  if (!username || !["cashier", "barista"].includes(role) || extra.length) throw new Error("Usage: node counter/provision.mjs <username> <cashier|barista>");
  const password = await hiddenPassword("Password (12–256 characters, hidden): ");
  const repeated = await hiddenPassword("Repeat password (hidden): ");
  if (password !== repeated) throw new Error("Passwords do not match");
  const dbPath = process.env.COUNTER_DB ?? fileURLToPath(new URL("./data/counter.sqlite", import.meta.url));
  const user = await provisionUser({ dbPath: resolve(dbPath), username, password, role });
  console.log(`Account provisioned: ${user.username} (${user.role}). Existing sessions were invalidated.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
