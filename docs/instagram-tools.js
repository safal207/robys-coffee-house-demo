const profileUrl = "https://www.instagram.com/robyscoffeehouse/";
const handle = "@robyscoffeehouse";

const copy = {
  tr: {
    eyebrow: "INSTAGRAM · MASA SERVİSİ",
    title: "Bir dokunuşla bize ulaşın.",
    lead: "Mesajı seçin, kopyalayın ve Instagram'da Roby's hesabına gönderin.",
    openProfile: "Instagram'ı aç",
    tableEyebrow: "MASADAN MESAJ",
    tableTitle: "Ne getirelim?",
    tableLabel: "Masa",
    waiter: "Garson çağır",
    bill: "Hesabı iste",
    water: "Su iste",
    question: "Menüyü sor",
    messageLabel: "Hazır mesaj",
    copy: "Mesajı kopyala",
    copied: "Kopyalandı ✓",
    sendInstagram: "Instagram'da gönder",
    helper: "Mesajı kopyaladıktan sonra Instagram'da “Mesaj” düğmesine dokunun ve yapıştırın.",
    instagramEyebrow: "BİZİ INSTAGRAM'DA BULUN",
    instagramLead: "Kahvenizi paylaşın, bizi etiketleyin ve yeni tatlıları Instagram'dan takip edin.",
    copyHandle: "@robyscoffeehouse'u kopyala",
    handleCopied: "Kullanıcı adı kopyalandı ✓",
    viewProfile: "Profili gör ↗",
    scanTitle: "Instagram için tara",
    scanLead: "Kamerayı açın ve QR kodu okutun.",
    menuLink: "Dijital menü",
    messages: {
      waiter: "Masa {table} — garson çağırmak istiyoruz.",
      bill: "Masa {table} — hesabı alabilir miyiz?",
      water: "Masa {table} — su getirebilir misiniz?",
      question: "Masa {table} — menü hakkında bir sorumuz var."
    }
  },
  en: {
    eyebrow: "INSTAGRAM · TABLE SERVICE",
    title: "Reach us with one tap.",
    lead: "Choose a message, copy it and send it to Roby's on Instagram.",
    openProfile: "Open Instagram",
    tableEyebrow: "MESSAGE FROM YOUR TABLE",
    tableTitle: "How can we help?",
    tableLabel: "Table",
    waiter: "Call a waiter",
    bill: "Ask for the bill",
    water: "Ask for water",
    question: "Ask about menu",
    messageLabel: "Ready message",
    copy: "Copy message",
    copied: "Copied ✓",
    sendInstagram: "Send on Instagram",
    helper: "After copying, tap “Message” on Instagram and paste the text.",
    instagramEyebrow: "FIND US ON INSTAGRAM",
    instagramLead: "Share your coffee, tag us and follow new desserts on Instagram.",
    copyHandle: "Copy @robyscoffeehouse",
    handleCopied: "Username copied ✓",
    viewProfile: "View profile ↗",
    scanTitle: "Scan for Instagram",
    scanLead: "Open your camera and scan the QR code.",
    menuLink: "Digital menu",
    messages: {
      waiter: "Table {table} — we would like to call a waiter.",
      bill: "Table {table} — could we have the bill, please?",
      water: "Table {table} — could you bring us some water, please?",
      question: "Table {table} — we have a question about the menu."
    }
  },
  ru: {
    eyebrow: "INSTAGRAM · ОБСЛУЖИВАНИЕ СТОЛИКА",
    title: "Свяжитесь с нами одним нажатием.",
    lead: "Выберите сообщение, скопируйте его и отправьте Roby's в Instagram.",
    openProfile: "Открыть Instagram",
    tableEyebrow: "СООБЩЕНИЕ СО СТОЛИКА",
    tableTitle: "Что принести?",
    tableLabel: "Столик",
    waiter: "Позвать официанта",
    bill: "Попросить счёт",
    water: "Попросить воду",
    question: "Спросить о меню",
    messageLabel: "Готовое сообщение",
    copy: "Скопировать сообщение",
    copied: "Скопировано ✓",
    sendInstagram: "Отправить в Instagram",
    helper: "После копирования нажмите «Сообщение» в Instagram и вставьте текст.",
    instagramEyebrow: "МЫ В INSTAGRAM",
    instagramLead: "Делитесь своим кофе, отмечайте нас и следите за новыми десертами.",
    copyHandle: "Скопировать @robyscoffeehouse",
    handleCopied: "Имя пользователя скопировано ✓",
    viewProfile: "Открыть профиль ↗",
    scanTitle: "QR-код Instagram",
    scanLead: "Откройте камеру и наведите её на QR-код.",
    menuLink: "Цифровое меню",
    messages: {
      waiter: "Столик {table} — позовите, пожалуйста, официанта.",
      bill: "Столик {table} — принесите, пожалуйста, счёт.",
      water: "Столик {table} — принесите, пожалуйста, воду.",
      question: "Столик {table} — у нас есть вопрос по меню."
    }
  }
};

const languageButtons = Array.from(document.querySelectorAll("[data-lang]"));
const tableInput = document.querySelector("#table-number");
const actionButtons = Array.from(document.querySelectorAll("[data-action]"));
const messagePreview = document.querySelector("#message-preview");
const copyMessageButton = document.querySelector("#copy-message");
const copyHandleButton = document.querySelector("#copy-handle");
const copyStatus = document.querySelector("#copy-status");
const openInstagram = document.querySelector("#open-instagram");

let language = "tr";
let action = "waiter";
let statusTimer;

function sanitizeTable(value) {
  return String(value || "7").trim().replace(/[^\p{L}\p{N}-]/gu, "").slice(0, 12) || "7";
}

function tableFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return sanitizeTable(params.get("t") || params.get("table") || "7");
}

function currentMessage() {
  return copy[language].messages[action].replace("{table}", sanitizeTable(tableInput.value));
}

function renderMessage() {
  messagePreview.textContent = currentMessage();
}

function setLanguage(nextLanguage) {
  if (!copy[nextLanguage]) return;
  language = nextLanguage;
  document.documentElement.lang = nextLanguage;
  languageButtons.forEach((button) => button.classList.toggle("active", button.dataset.lang === nextLanguage));
  document.querySelectorAll("[data-copy]").forEach((element) => {
    const key = element.dataset.copy;
    if (copy[nextLanguage][key]) element.textContent = copy[nextLanguage][key];
  });
  renderMessage();
  copyStatus.textContent = copy[nextLanguage].helper;
}

async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const succeeded = document.execCommand("copy");
  textarea.remove();
  if (!succeeded) throw new Error("Clipboard unavailable");
}

function showTemporaryStatus(text) {
  clearTimeout(statusTimer);
  copyStatus.textContent = text;
  statusTimer = window.setTimeout(() => {
    copyStatus.textContent = copy[language].helper;
  }, 2400);
}

languageButtons.forEach((button) => button.addEventListener("click", () => setLanguage(button.dataset.lang)));

actionButtons.forEach((button) => button.addEventListener("click", () => {
  action = button.dataset.action;
  actionButtons.forEach((item) => item.classList.toggle("active", item === button));
  renderMessage();
}));

tableInput.addEventListener("input", () => {
  tableInput.value = sanitizeTable(tableInput.value);
  renderMessage();
});

copyMessageButton.addEventListener("click", async () => {
  try {
    await writeClipboard(currentMessage());
    showTemporaryStatus(copy[language].copied);
  } catch {
    messagePreview.focus?.();
    showTemporaryStatus(copy[language].helper);
  }
});

copyHandleButton.addEventListener("click", async () => {
  try {
    await writeClipboard(handle);
    showTemporaryStatus(copy[language].handleCopied);
  } catch {
    showTemporaryStatus(copy[language].helper);
  }
});

openInstagram.href = profileUrl;
tableInput.value = tableFromUrl();
actionButtons[0]?.classList.add("active");
setLanguage("tr");
