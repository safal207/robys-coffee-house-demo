import { decodeOrderTicket } from "./order-ticket.js";
import { checkoutCopy, checkoutErrorMessage, renderTicketContent } from "./order-checkout.js?v=ede76ee31ffa";

const root = document.querySelector("#cashier-ticket");
const print = document.querySelector("#cashier-print");
const back = document.querySelector("#cashier-menu");
let language = "tr";
let decoded;
let failure;

function render() {
  const copy = checkoutCopy[language];
  document.documentElement.lang = language;
  document.title = `${copy.cashierTitle} | Roby's`;
  print.textContent = copy.print;
  back.textContent = copy.back;
  document.querySelectorAll("[data-cashier-language]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.cashierLanguage === language));
  });
  print.hidden = !decoded;
  if (decoded) {
    renderTicketContent(root, decoded.ticket, language, { cashier: true });
  } else {
    const title = document.createElement("h1");
    title.textContent = copy.cashierTitle;
    const message = document.createElement("p");
    message.className = "order-ticket-error";
    message.setAttribute("role", "alert");
    message.textContent = checkoutErrorMessage(failure, language);
    root.replaceChildren(title, message);
  }
}

function readTicket() {
  decoded = null;
  failure = null;
  try {
    decoded = decodeOrderTicket(window.location.hash.slice(1));
    language = decoded.language;
  } catch (error) { failure = error; }
  render();
}
document.querySelectorAll("[data-cashier-language]").forEach((button) => {
  button.addEventListener("click", () => { language = button.dataset.cashierLanguage; render(); });
});
print.addEventListener("click", () => window.print());
window.addEventListener("hashchange", readTicket);
readTicket();
