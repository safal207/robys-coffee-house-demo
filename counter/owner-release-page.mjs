// Pure owner HTML: explicitly approves an offline release candidate, never deploys it.
const text={
  tr:{title:"Menü yayını için hazırlık",intro:"Taslak değişikliklerini gözden geçir ve onay için sabitle. Bu sayfa müşteri menüsünü veya kasayı GÜNCELLEMEZ.",
    alert:"Henüz yayında değil. Yayın için imzalı paket, eşzamanlı dağıtım ve bağımsız kontrol gerekir.",
    items:"Menüdeki ürünler",changed:"Değiştirilen ürünler",photos:"Yeni fotoğraflar",
    prepare:"Yayın adayı oluştur",history:"Onay geçmişi",approve:"Adayı onayla", rights:"Fotoğraf kullanım hakkını, çevirileri ve fiyatları onaylıyorum.",
    proposed:"Onay bekliyor",approved:"Onaylandı · yayında değil",rejected:"İptal",
    back:"Menü düzenleyici",cancel:"Adayı iptal et",empty:"Henüz yayın adayı yok"},
  en:{title:"Prepare menu release",intro:"Review and lock draft edits for owner approval. This page DOES NOT update the guest menu or cashier prices.",
    alert:"Not published. A signed package, coordinated deployment and independent review are required.",
    items:"Menu products",changed:"Edited products",photos:"New photos",
    prepare:"Create release candidate",history:"Approval history",approve:"Approve candidate", rights:"I confirm photo rights, translations and approved prices.",
    proposed:"Pending approval",approved:"Approved · not live",rejected:"Cancelled",
    back:"Menu editor",cancel:"Cancel candidate",empty:"No release candidates yet"},
  ru:{title:"Подготовка публикации меню",intro:"Проверь черновики и зафиксируй согласованную версию. Это НЕ изменяет меню гостей или цены кассы.",
    alert:"Не опубликовано. Требуются подписанный пакет, согласованное развёртывание и независимая проверка.",
    items:"Позиций в меню",changed:"Изменено",photos:"Новых фото",
    prepare:"Создать кандидат релиза",history:"История согласований",approve:"Одобрить кандидат", rights:"Подтверждаю права на фото, переводы и цены.",
    proposed:"Ожидает согласования",approved:"Одобрен · не опубликован",rejected:"Отменён",
    back:"Редактор меню",cancel:"Отменить кандидат",empty:"Кандидатов пока нет"}
};
const esc=v=>String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const css=[
  ":root{color-scheme:light;font-family:system-ui,sans-serif;background:#faf5f0;color:#3c2e2d}",
  "*{box-sizing:border-box}body{margin:0}main{margin:auto;max-width:920px;padding:24px 16px 65px}",
  "header{background:#3c252b;color:white;padding:18px 5vw}header a{color:white}",
  "h1{font-size:clamp(26px,4vw,39px)}h2{font-size:21px}",
  ".muted{color:#665856;line-height:1.5}.alert{padding:15px;background:#fff2d6;border-radius:13px;border-left:4px solid #a57f32}",
  ".stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:22px 0}",
  ".card{padding:17px;border-radius:17px;background:white;border:1px solid #eaded9}",
  ".card strong{display:block;font-size:27px;margin:8px 0}",
  ".table{background:white;border:1px solid #eaded9;border-radius:16px;padding:15px}",
  ".entry{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:space-between;border-bottom:1px solid #ede2df;padding:14px 2px}",
  "button{font:inherit;border:0;border-radius:10px;background:#994b5f;color:white;font-weight:700;padding:12px 16px;min-height:44px}",
  "button.secondary{background:#59434a}form{display:inline-block;margin:4px}",
  ".badge{font-size:12px;border-radius:40px;padding:5px 10px;background:#f3e6e9}",
  ".hash{font:12px ui-monospace,monospace;overflow-wrap:anywhere;color:#706363}",
  ".changes{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin:14px 0}",
  "@media(max-width:480px){.entry{align-items:flex-start;flex-direction:column}}"
].join("");
const field=(k,v)=>'<input type="hidden" name="'+esc(k)+'" value="'+esc(v)+'">';
export function renderOwnerReleasePage({lang="tr",csrf,preview,history}) {
  if(!text[lang] || !/^[A-Za-z0-9_-]{43}$/.test(csrf) ||
      !/^[a-f0-9]{64}$/.test(preview?.hash) || !Array.isArray(history))
    throw Error("Invalid owner release page input");
  const t=text[lang];
  const changed=preview.snapshot.entries.filter(x=>x.changed).map(x=>
    '<div class="card"><strong style="font-size:16px">'+esc(x.names[lang])+'</strong><p>'+
    esc((x.priceMinor/100).toLocaleString(lang==="tr"?"tr-TR":"en-US"))+
    ' ₺</p><span class="badge">v'+esc(x.revision)+'</span></div>').join("");
  const stats=[[t.items,preview.total],[t.changed,preview.changed],[t.photos,preview.images]]
    .map(([a,b])=>'<div class="card"><span>'+esc(a)+'</span><strong>'+esc(b)+'</strong></div>').join("");
  const historyHtml=history.map(item=>{
    const statusText=t[item.status]??item.status;
    let action="";
    if(item.status==="proposed"){
      const common=field("csrf",csrf)+field("id",item.id)+field("hash",item.snapshot_sha256)+field("lang",lang);
      action='<form method="POST" action="/owner/releases/approve">'+common+
        '<label class="muted"><input type="checkbox" name="rights" value="yes" required> '+esc(t.rights)+'</label>'+
        '<button type="submit">'+esc(t.approve)+'</button></form>'+
        '<form method="POST" action="/owner/releases/reject">'+common+
        '<button class="secondary" type="submit">'+esc(t.cancel)+'</button></form>';
    }
    return '<div class="entry"><div><strong>'+esc(statusText)+'</strong><div class="hash">'+
      esc(item.id)+' · '+esc(item.snapshot_sha256.slice(0,16))+'</div></div><div>'+action+'</div></div>';
  }).join("");
  const propose='<form method="POST" action="/owner/releases/propose">'+
    field("csrf",csrf)+field("hash",preview.hash)+field("lang",lang)+
    '<button type="submit">'+esc(t.prepare)+'</button></form>';
  return '<!doctype html><html lang="'+lang+'"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">'+
    '<title>Robys · '+esc(t.title)+'</title><style>'+css+'</style></head><body>'+
    '<header><b>ROBY’S COFFEE HOUSE</b> · <a href="/owner/catalog?lang='+lang+'">'+esc(t.back)+'</a></header>'+
    '<main><h1>'+esc(t.title)+'</h1><p class="muted">'+esc(t.intro)+'</p>'+
    '<p class="alert">'+esc(t.alert)+'</p><div class="stats">'+stats+'</div>'+
    '<p class="hash">Snapshot SHA-256: '+esc(preview.hash)+'</p>'+
    '<section><h2>'+esc(t.changed)+'</h2><div class="changes">'+(changed||'<p>—</p>')+'</div></section>'+
    propose+'<section><h2>'+esc(t.history)+'</h2><div class="table">'+
    (historyHtml||'<p class="muted">'+esc(t.empty)+'</p>')+'</div></section></main></body></html>';
}
