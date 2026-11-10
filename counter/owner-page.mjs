// Script-free, server-rendered dashboard on the private Counter host only.
const words = {
  tr: {
    title:"ROBY'S · İşletme paneli", menuEditor:"Menü ve fotoğrafları düzenle", eyebrow:"ROBY'S COFFEE HOUSE", login:"İşletme sahibi girişi",
    prompt:"Yalnızca yetkili işletme sahibi için.", username:"Kullanıcı adı", password:"Şifre",
    submit:"Giriş yap", logout:"Çıkış yap", invalid:"Giriş başarısız. Bilgileri kontrol edin.",
    orders:"Ödemesi onaylanan sipariş", gross:"Kasada onaylanan tutar", basket:"Ortalama sepet",
    from:"Başlangıç (dahil)", to:"Bitiş (hariç)", filter:"Dönemi göster",
    days:"Günlük onaylanan ödemeler", empty:"Bu dönemde doğrulanmış ödeme bulunmuyor.",
    details:"Kasiyer onayı ve denetim kaydı. Banka tahsilatı, net kâr veya iade raporu değildir.",
    source:"Kampanya kaynağı: doğrulanmadı. QR gösterimi satış değildir."
  },
  en: {
    title:"ROBY'S · Owner dashboard", menuEditor:"Edit menu and photos", eyebrow:"ROBY'S COFFEE HOUSE", login:"Owner sign-in",
    prompt:"Authorized café owner only.", username:"Username", password:"Password",
    submit:"Sign in", logout:"Sign out", invalid:"Sign-in failed. Check your credentials.",
    orders:"Cashier-acknowledged paid orders", gross:"Acknowledged gross", basket:"Average basket",
    from:"From (inclusive)", to:"Until (exclusive)", filter:"Show period",
    days:"Audited paid orders by day", empty:"No verified payments in this period.",
    details:"Cashier acknowledgement backed by an audit record. Not bank settlement, net profit or a refund ledger.",
    source:"Campaign source: unverified. Showing a QR is not a sale."
  },
  ru: {
    title:"ROBY'S · Кабинет хозяйки", menuEditor:"Изменить меню и фото", eyebrow:"ROBY'S COFFEE HOUSE", login:"Вход владельца",
    prompt:"Только для уполномоченного владельца кафе.", username:"Логин", password:"Пароль",
    submit:"Войти", logout:"Выйти", invalid:"Не удалось войти. Проверьте данные.",
    orders:"Подтверждённые кассой заказы", gross:"Подтверждённая сумма", basket:"Средний чек",
    from:"С (включительно)", to:"До (не включительно)", filter:"Показать период",
    days:"Подтверждённые оплаты по дням", empty:"За период подтверждённых оплат нет.",
    details:"Оплаты по подтверждению кассира и журналу аудита. Не банковское зачисление, прибыль или учёт возвратов.",
    source:"Источник кампании: не подтверждён. Показ QR не считается продажей."
  }
};
const fmtLocale = {tr:"tr-TR",en:"en-US",ru:"ru-RU"};
const esc = value => String(value).replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[c]);
const css = [
  ":root{font-family:ui-sans-serif,system-ui,Arial;color:#342b29;background:#f9f5ef}",
  "*{box-sizing:border-box}body{margin:0;min-height:100vh}",
  "header{display:flex;justify-content:space-between;gap:18px;align-items:center;background:#321f26;color:#fff;padding:18px max(5vw,20px)}",
  "header nav{display:flex;gap:14px}header nav a{color:white;text-decoration:none;font-size:13px;font-weight:700}",
  ".shell{max-width:1000px;margin:auto;padding:30px 22px 80px}",
  ".brand{letter-spacing:.19em;font-size:12px;font-weight:700}",
  "h1{font-size:clamp(26px,4vw,43px);letter-spacing:-.03em;margin:12px 0 22px}",
  ".muted{color:#756d66}.auth{max-width:430px;margin:7vh auto;background:white;padding:30px;border-radius:20px;border:1px solid #eee4dd}",
  "label{display:flex;flex-direction:column;gap:7px;font-weight:600;font-size:14px}",
  "input{font:inherit;border:1px solid #d8c8c4;border-radius:10px;padding:12px;min-height:44px;width:100%}",
  "button{background:#a44d61;color:white;font:inherit;font-weight:650;border:none;border-radius:10px;padding:12px 18px;min-height:44px;cursor:pointer}",
  "button:hover{background:#863c50}form{display:flex;gap:14px;flex-wrap:wrap;align-items:end}",
  ".auth form{flex-direction:column;align-items:stretch}.auth label{width:100%}",
  ".controls{margin:16px 0 28px;display:flex;align-items:end;justify-content:space-between;gap:16px;flex-wrap:wrap}",
  ".controls label{min-width:150px}.controls button{align-self:end}",
  ".outline{background:transparent;color:#a44d61;border:1px solid #d9acb6}.outline:hover{background:#f3e7ea}",
  ".metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}",
  ".metric{background:white;border:1px solid #eee4dd;border-radius:18px;padding:22px;box-shadow:0 3px 16px #2e182108}",
  ".metric h2{font-size:14px;color:#6f5d60;font-weight:600;margin:0 0 20px}",
  ".metric strong{font-size:clamp(23px,3.5vw,33px);letter-spacing:-.03em;overflow-wrap:anywhere}",
  ".days{background:white;border-radius:20px;margin:26px 0;padding:20px;border:1px solid #eee4dd}",
  ".day{display:grid;grid-template-columns:115px 1fr minmax(100px,auto);gap:16px;align-items:center;padding:11px 0;border-bottom:1px solid #f3e8e7}",
  ".bar{height:11px;border-radius:99px;background:#f2e7e6;overflow:hidden}",
  ".bar span{display:block;height:100%;background:#a44d61;border-radius:99px}",
  ".catalogLink{display:inline-block;background:#f1e1e7;color:#713749;padding:12px 16px;border-radius:12px;font-weight:700;text-decoration:none}.catalogLink:hover{background:#e7c8d4}",
  ".note{font-size:13px;line-height:1.6;color:#71655f;margin-top:20px}",
  ".danger{color:#a02440}a{color:inherit}",
  "@media(max-width:560px){.shell{padding:22px 14px}.day{grid-template-columns:1fr auto;gap:8px}.bar{grid-column:1/-1;grid-row:2}.auth{padding:20px}}"
].join("");

export function ownerReportDates(params, at) {
  if (!Number.isSafeInteger(at) || at <= 0) throw Error("Invalid owner clock");
  for (const key of params.keys()) if (!["from","to","lang"].includes(key) || params.getAll(key).length !== 1)
    throw Error("Invalid owner query");
  const today = new Date(at + 3 * 3600000);
  const day = today.toISOString().slice(0,10);
  const defaultFrom = new Date(today.getTime() - 6 * 86400000).toISOString().slice(0,10);
  const defaultTo = new Date(today.getTime() + 86400000).toISOString().slice(0,10);
  const from = params.get("from") ?? defaultFrom;
  const to = params.get("to") ?? defaultTo;
  const valid = text => /^\d{4}-\d{2}-\d{2}$/.test(text) &&
    new Date(Date.parse(text + "T00:00:00+03:00") + 3 * 3600000).toISOString().slice(0,10) === text;
  if (!valid(from) || !valid(to)) throw Error("Invalid owner dates");
  const fromMs = Date.parse(from + "T00:00:00+03:00");
  const toMs = Date.parse(to + "T00:00:00+03:00");
  if (toMs <= fromMs || toMs - fromMs > 93 * 86400000) throw Error("Invalid owner report range");
  const lang = params.get("lang") ?? "tr";
  if (!words[lang]) throw Error("Invalid owner language");
  return {from,to,fromMs,toMs,lang};
}

export function renderOwnerLogin(lang = "tr", invalid = false) {
  if (!words[lang]) throw Error("Invalid owner language");
  const t = words[lang];
  const form = [
    '<section class="auth"><h1>',esc(t.login),'</h1><p class="muted">',esc(t.prompt),'</p>',
    invalid ? '<p role="alert" class="danger">'+esc(t.invalid)+'</p>' : "",
    '<form method="POST" action="/owner/login" autocomplete="on">',
    '<input type="hidden" name="lang" value="',esc(lang),'">',
    '<label>',esc(t.username),'<input name="username" required maxlength="64" autocomplete="username"></label>',
    '<label>',esc(t.password),'<input name="password" type="password" required maxlength="256" autocomplete="current-password"></label>',
    '<button type="submit">',esc(t.submit),'</button></form></section>'
  ].join("");
  return shell(t,lang,form);
}

export function renderOwnerDashboard({ username, csrfToken, range, summary }) {
  if (!words[range.lang] || typeof csrfToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(csrfToken) ||
      typeof username !== "string" || summary.authority !== "cashier-acknowledged-and-audited" ||
      summary.currency !== "TRY" || summary.campaignAttribution !== null)
    throw Error("Invalid authenticated owner report");
  const t = words[range.lang], locale = fmtLocale[range.lang];
  const money = n => new Intl.NumberFormat(locale,{style:"currency",currency:"TRY"}).format(n/100);
  const num = n => new Intl.NumberFormat(locale).format(n);
  const metrics = [
    [t.orders,num(summary.paidOrders)],
    [t.gross,money(summary.grossMinor)],
    [t.basket,summary.averageMinor === null ? "—" : money(summary.averageMinor)]
  ].map(item => '<article class="metric"><h2>'+esc(item[0])+'</h2><strong>'+esc(item[1])+'</strong></article>').join("");
  const highest = Math.max(1,...summary.byDay.map(row => row.grossMinor));
  const rows = summary.byDay.map(row => '<div class="day"><time datetime="'+esc(row.day)+'">'+esc(row.day)+
    '</time><div class="bar"><span style="width:'+Math.round(row.grossMinor*100/highest)+'%"></span></div><strong>'+
    esc(money(row.grossMinor))+'</strong></div>').join("");
  const filters = [
    '<div class="controls"><form action="/owner" method="GET">',
    '<input type="hidden" name="lang" value="',esc(range.lang),'">',
    '<label>',esc(t.from),'<input type="date" name="from" value="',esc(range.from),'" required></label>',
    '<label>',esc(t.to),'<input type="date" name="to" value="',esc(range.to),'" required></label>',
    '<button type="submit">',esc(t.filter),'</button></form>',
    '<form action="/owner/logout" method="POST">',
    '<input type="hidden" name="csrf" value="',esc(csrfToken),'">',
    '<button type="submit" class="outline">',esc(t.logout),'</button></form></div>'
  ].join("");
  const body = [
    '<h1>',esc(t.title),'</h1><p class="muted">',esc(username),'</p>',
    '<p><a class="catalogLink" href="/owner/catalog?lang=',esc(range.lang),'">',esc(t.menuEditor),'</a></p>',
    filters,'<div class="metrics">',metrics,'</div>',
    '<section class="days"><h2>',esc(t.days),'</h2>',rows || '<p class="muted">'+esc(t.empty)+'</p>','</section>',
    '<footer class="note"><p>',esc(t.details),'</p><p>',esc(t.source),'</p></footer>'
  ].join("");
  return shell(t,range.lang,body);
}
function shell(t,lang,body) {
  return [
    '<!doctype html><html lang="',esc(lang),'"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="robots" content="noindex,nofollow">',
    '<meta name="referrer" content="no-referrer"><title>',esc(t.title),'</title>',
    '<style>',css,'</style></head><body>',
    '<header><div class="brand">',esc(t.eyebrow),'</div>',
    '<nav aria-label="Language"><a href="/owner?lang=tr">TR</a><a href="/owner?lang=en">EN</a><a href="/owner?lang=ru">RU</a></nav></header>',
    '<main class="shell">',body,'</main></body></html>'
  ].join("");
}
