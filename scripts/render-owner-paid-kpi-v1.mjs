// Offline owner report HTML. No scripts, network, tracking or public URL.
import { PAID_REPORT_SCHEMA_VERSION } from "./owner-paid-kpi-v1.mjs";

const copy = {
  tr:{title:"Roby's · Satış Özeti",orders:"Ödenmiş sipariş",revenue:"Onaylanan tutar",average:"Ortalama sepet",
     days:"Günlük gerçekleşen satışlar",empty:"Bu dönem için doğrulanmış ödeme yok.",
     note:"Veri kaynağı: kasiyer tarafından onaylanan ve denetim kaydı bulunan ödemeler. Banka mutabakatı veya net kâr değildir.",
     unknown:"Kampanya kaynağı henüz doğrulanmadı."},
  en:{title:"Roby's · Sales summary",orders:"Paid orders",revenue:"Acknowledged gross",average:"Average basket",
     days:"Verified daily sales",empty:"No verified payments in this period.",
     note:"Source: cashier-acknowledged payments with a matching audit record. Not bank settlement or net profit.",
     unknown:"Campaign attribution is not yet verified."},
  ru:{title:"Roby's · Сводка продаж",orders:"Оплаченные заказы",revenue:"Подтверждённая сумма",average:"Средний чек",
     days:"Оплаты по дням",empty:"За период нет подтверждённых оплат.",
     note:"Источник: оплаты, подтверждённые кассиром и журналом аудита. Не банковское зачисление и не чистая прибыль.",
     unknown:"Рекламный источник оплаты пока не подтверждён."}
};
const locale = {tr:"tr-TR",en:"en-US",ru:"ru-RU"};
const escape = value => String(value).replace(/[&<>"']/g, ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const valid = n => Number.isSafeInteger(n) && n>=0;
export function renderOwnerPaidKpiHtml(report, language="tr") {
  if (!copy[language]) throw Error("Unsupported report language");
  if (!report || report.schemaVersion!==PAID_REPORT_SCHEMA_VERSION || report.currency!=="TRY" ||
      report.authority!=="cashier-acknowledged-and-audited" ||
      !valid(report.paidOrders) || !valid(report.grossMinor) ||
      !valid(report.fromMs) || !valid(report.toMs) || report.fromMs >= report.toMs ||
      !Array.isArray(report.byDay) || report.byDay.length>366 ||
      (report.paidOrders === 0 && report.averageMinor!==null) ||
      (report.paidOrders>0 && !valid(report.averageMinor)) ||
      report.byDay.some(row=>!/^\d{4}-\d{2}-\d{2}$/.test(row.day)||!valid(row.paidOrders)||!valid(row.grossMinor)) ||
      report.byDay.reduce((sum,row)=>sum+row.paidOrders,0)!==report.paidOrders ||
      report.byDay.reduce((sum,row)=>sum+row.grossMinor,0)!==report.grossMinor) throw Error("Invalid verified paid report");
  const t=copy[language], fmt=new Intl.NumberFormat(locale[language]), money=n=>new Intl.NumberFormat(locale[language],{style:"currency",currency:"TRY"}).format(n/100);
  const max=Math.max(...report.byDay.map(row=>row.grossMinor),1);
  const stats=[[t.orders,fmt.format(report.paidOrders)],[t.revenue,money(report.grossMinor)],[t.average,report.averageMinor===null?"—":money(report.averageMinor)]];
  const cards=stats.map(([label,value])=>`<article class="metric"><h2>${escape(label)}</h2><p>${escape(value)}</p></article>`).join("");
  const rows=report.byDay.map(row=>`<div class="daily"><time datetime="${escape(row.day)}">${escape(row.day)}</time><div class="track"><span style="width:${Math.min(100,Math.round(row.grossMinor/max*100))}%"></span></div><strong>${escape(money(row.grossMinor))}</strong></div>`).join("");
  const css=":root{color-scheme:light;font-family:system-ui,-apple-system,sans-serif;color:#382924;background:#f6f1ea}body{margin:0;padding:clamp(16px,5vw,42px)}main{max-width:850px;margin:auto}.eyebrow{letter-spacing:.12em;text-transform:uppercase;color:#8e5360}h1{font-size:clamp(1.7rem,5vw,2.6rem)}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.metric{background:#fff;border-radius:16px;padding:22px;box-shadow:0 2px 12px #38292412}.metric h2{font-size:1rem;color:#6a5a50}.metric p{font-size:1.55rem;font-weight:750}.daily{display:grid;grid-template-columns:110px 1fr auto;gap:14px;align-items:center;margin:12px 0}.track{height:12px;background:#eaded9;border-radius:8px;overflow:hidden}.track span{display:block;height:100%;background:#af5266;border-radius:8px}footer{margin-top:38px;font-size:.88rem;color:#6a5a50;line-height:1.55}@media(max-width:450px){.daily{grid-template-columns:1fr auto}.track{grid-column:1/-1;grid-row:2}}";
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><title>${escape(t.title)}</title><style>${css}</style></head><body><main><p class="eyebrow">ROBY'S COFFEE HOUSE</p><h1>${escape(t.title)}</h1><div class="metrics">${cards}</div><section aria-label="${escape(t.days)}"><h2>${escape(t.days)}</h2>${rows || `<p>${escape(t.empty)}</p>`}</section><footer><p>${escape(t.note)}</p><p>${escape(t.unknown)}</p></footer></main></body></html>`;
}
