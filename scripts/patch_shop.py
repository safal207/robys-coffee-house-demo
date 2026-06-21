from pathlib import Path
import re

path = Path(__file__).resolve().parents[1] / "shop.js"
text = path.read_text(encoding="utf-8")
text = re.sub(r'\nconst premiumAssets = \{.*?\n\};\n', "\n", text, count=1, flags=re.S)
text = re.sub(r'\nfunction bytesToBlobUrl\(base64\) \{.*?\n\}\n\nasync function hydratePremiumImages\(\) \{.*?\n\}\n', "\n", text, count=1, flags=re.S)
text = text.replace('    <button class="shop-cart-button" type="button" aria-expanded="false">', '    <button class="shop-cart-button shop-cart-button-desktop" type="button" aria-expanded="false">', 1)
text = text.replace('  document.querySelector("[data-cart-button-label]").textContent = t("cart");', '  document.querySelectorAll("[data-cart-button-label]").forEach((node) => { node.textContent = t("cart"); });')
text = text.replace('  document.querySelector("[data-cart-count]").textContent = String(totals.count);', '  document.querySelectorAll("[data-cart-count]").forEach((node) => { node.textContent = String(totals.count); });')
text = text.replace('  document.querySelector(".shop-cart-button").setAttribute("aria-expanded", "true");', '  document.querySelectorAll(".shop-cart-button").forEach((button) => button.setAttribute("aria-expanded", "true"));')
text = text.replace('  document.querySelector(".shop-cart-button").setAttribute("aria-expanded", "false");', '  document.querySelectorAll(".shop-cart-button").forEach((button) => button.setAttribute("aria-expanded", "false"));')
text = text.replace("hydratePremiumImages();\n", "")
path.write_text(text, encoding="utf-8")
