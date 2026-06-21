import { readFileSync, statSync } from "node:fs";

const imagePath = "src/products/lotus-cheesecake-menu.svg";
const products = readFileSync("products-extra.js", "utf8");
const svg = readFileSync(imagePath, "utf8");

if (!products.includes(imagePath)) throw new Error("Lotus gallery image is not referenced by products-extra.js");
if (!svg.includes("data:image/webp;base64,")) throw new Error("Lotus gallery SVG does not contain the embedded WebP artwork");
if (statSync(imagePath).size > 30_000) throw new Error("Lotus gallery asset exceeds 30 KB");

console.log(`Verified Lotus gallery image: ${statSync(imagePath).size} bytes`);
