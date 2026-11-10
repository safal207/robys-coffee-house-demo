// HTML-only owner CMS: no scripts, no public draft publication.
const copy={
  tr:{title:"Menüyü düzenle", releases:"Yayın hazırlığı",sub:"Değişiklikler taslaktır; misafir menüsünü ve kasa fiyatını değiştirmez.",
    browse:"Menü ürünleri",edit:"Düzenle",back:"İşletme paneli",photo:"Fotoğraf",default:"Geçerli fotoğraf",
    upload:"Yeni fotoğrafı taslağa ekle",photoInfo:"JPEG / PNG / WebP, en fazla 4 MB. Meta veriler kaldırılır ve WebP olarak güvenle saklanır.",
    price:"Fiyat (TRY)",save:"Taslağı kaydet",name:"Ürün adı",history:"Değişiklik geçmişi",
    restore:"Önceki duruma döndür",empty:"Henüz değişiklik yok",edited:"Taslak düzenlendi",
    current:"Orijinal menü",tr:"Türkçe",en:"İngilizce",ru:"Rusça",original:"Orijinal fotoğraf",
    warning:"Bu sayfa taslak içindir. Değişiklikler müşterilere veya kasaya otomatik yansımaz.",
    pending:"Yayında değil"},
  en:{title:"Edit menu", releases:"Prepare release",sub:"Changes are drafts and do not affect the guest menu or cashier prices.",
    browse:"Menu products",edit:"Edit",back:"Owner dashboard",photo:"Photo",default:"Current photo",
    upload:"Stage replacement photo",photoInfo:"JPEG / PNG / WebP, up to 4 MB. Metadata is removed and the photo is stored privately as WebP.",
    price:"Price (TRY)",save:"Save draft",name:"Product name",history:"Change history",
    restore:"Restore previous revision",empty:"No edits yet",edited:"Draft edited",
    current:"Original menu",tr:"Turkish",en:"English",ru:"Russian",original:"Original photo",
    warning:"Drafts only. Nothing is automatically published to customers or cashier pricing.",
    pending:"Not published"},
  ru:{title:"Редактор меню", releases:"Подготовить публикацию",sub:"Все изменения остаются черновиками и не влияют на меню гостей и цены кассы.",
    browse:"Позиции меню",edit:"Изменить",back:"Кабинет хозяйки",photo:"Фотография",default:"Текущее фото",
    upload:"Загрузить фото в черновик",photoInfo:"JPEG / PNG / WebP, до 4 МБ. Метаданные удаляются, фото сохраняется приватно в WebP.",
    price:"Цена (TRY)",save:"Сохранить черновик",name:"Название блюда",history:"История изменений",
    restore:"Восстановить предыдущую версию",empty:"Правок пока нет",edited:"Черновик изменён",
    current:"Исходное меню",tr:"Турецкий",en:"Английский",ru:"Русский",original:"Исходное фото",
    warning:"Это черновики. Изменения не публикуются для гостей и не меняют стоимость на кассе.",
    pending:"Не опубликовано"}
};
const esc=value=>String(value).replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
const css=[
  ":root{font-family:system-ui,-apple-system,sans-serif;color:#392b2d;background:#faf5ef;color-scheme:light}",
  "*{box-sizing:border-box}body{margin:0}a{color:#8b4056}header{background:#38252b;color:#fff;padding:22px max(4vw,16px)}",
  ".wrap{max-width:1050px;margin:auto;padding:24px 14px 70px}header a{color:#fff}nav{display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:13px}nav a{text-decoration:none;font-weight:700}",
  ".eyebrow{font-size:12px;letter-spacing:.14em;font-weight:700}.lead{line-height:1.5;color:#6b5c59}",
  "h1{font-size:clamp(28px,4vw,42px);margin:12px 0}h2{font-size:22px}h3{font-size:17px}",
  ".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:13px}",
  ".item,.panel{background:#fff;border:1px solid #ebded9;border-radius:18px;padding:16px;box-shadow:0 3px 14px #3720290a}",
  ".item img{width:100%;height:155px;object-fit:cover;border-radius:12px;background:#eee3dc}",
  ".item h2{font-size:17px;margin:10px 0 6px}.item p{font-size:14px}",
  ".badge{font-size:12px;background:#f3e1e4;padding:5px 9px;border-radius:40px;display:inline-block}",
  ".product{display:grid;grid-template-columns:minmax(220px,340px) 1fr;gap:20px}",
  ".product img{width:100%;max-height:340px;object-fit:cover;border-radius:16px;background:#eee5db}",
  ".panel{margin-bottom:18px}label{display:block;font-size:14px;font-weight:650;margin-bottom:14px}",
  "input{display:block;font:inherit;width:100%;border-radius:11px;border:1px solid #ccbdb9;padding:11px;min-height:44px;margin-top:6px}",
  "input[type=file]{font-size:14px}button{font:inherit;font-weight:700;border:0;border-radius:10px;padding:12px 16px;background:#984e61;color:#fff;min-height:44px;cursor:pointer}",
  "button.secondary{background:#614c50}.warning{padding:14px 17px;background:#f9ead3;border-left:3px solid #a37e2e;border-radius:10px;font-size:14px}",
  ".muted{color:#6b5c59;font-size:13px}.history{display:flex;flex-wrap:wrap;gap:12px;align-items:center;border-top:1px solid #eee;padding:12px 0}",
  ".history form{margin-left:auto}.history button{font-size:13px}.count{margin:20px 0}",
  "@media(max-width:660px){.product{grid-template-columns:1fr}.product img{max-height:250px}}"
].join("");

function shell(lang,body) {
 const t=copy[lang];
 return '<!doctype html><html lang="'+lang+'"><head><meta charset="utf-8">'+
 '<meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">'+
 '<title>ROBY’S · '+esc(t.title)+'</title><style>'+css+'</style></head><body>'+
 '<header><nav><span class="eyebrow">ROBY’S COFFEE HOUSE</span>'+
 '<a href="/owner?lang='+lang+'">'+esc(t.back)+'</a>'+
 '<a href="/owner/catalog?lang=tr">TR</a><a href="/owner/catalog?lang=en">EN</a>'+
 '<a href="/owner/catalog?lang=ru">RU</a>'+
 '<a href="/owner/releases?lang='+lang+'">'+esc(t.releases)+'</a></nav></header><main class="wrap">'+body+'</main></body></html>';
}
const productLink=(id,lang)=>"/owner/catalog/item?id="+encodeURIComponent(id)+"&lang="+lang;
const assetLink=(entry)=>entry.draft.imageId ? "/owner/catalog/media/"+entry.draft.imageId :
  "/"+entry.product.image.replace(/^\/+/,"");
const csrfField=csrf=>'<input type="hidden" name="csrf" value="'+esc(csrf)+'">';
const valueField=(name,val)=>'<input type="hidden" name="'+name+'" value="'+esc(val)+'">';
export function renderOwnerCatalogList(entries,lang="tr") {
 if(!copy[lang] || !Array.isArray(entries))throw Error("Invalid catalog view");
 const t=copy[lang];
 const cards=entries.map(entry=>{
  const {product,draft,modified}=entry;
  return '<article class="item"><img loading="lazy" src="'+esc(assetLink(entry))+
  '" alt="'+esc(draft.nameTr)+'"><h2>'+esc(draft.nameTr)+'</h2>'+
  '<p class="muted">'+esc(product.category[lang])+'</p><p><strong>'+
  esc(draft.priceTry)+' ₺</strong> '+(modified?'<span class="badge">'+esc(t.pending)+'</span>':'')+
  '</p><a href="'+esc(productLink(product.id,lang))+'">'+esc(t.edit)+'</a></article>';
 }).join("");
 return shell(lang,'<h1>'+esc(t.title)+'</h1><p class="lead">'+esc(t.sub)+'</p>'+
   '<p class="warning">'+esc(t.warning)+'</p>'+
   '<h2>'+esc(t.browse)+'</h2><p class="count">'+entries.length+' products</p>'+
   '<div class="grid">'+cards+'</div>');
}
export function renderOwnerCatalogItem(entry,history,csrf,lang="tr") {
 if(!copy[lang] || !entry?.product || !Array.isArray(history) ||
    !/^[A-Za-z0-9_-]{43}$/.test(csrf))throw Error("Invalid product editor");
 const t=copy[lang],p=entry.product,d=entry.draft;
 const shared=csrfField(csrf)+valueField("id",p.id)+valueField("revision",entry.revision)+valueField("lang",lang);
 const mainForm='<section class="panel"><h2>'+esc(t.name)+'</h2>'+
  '<form method="POST" action="/owner/catalog/save">'+shared+
  [['nameTr',t.tr,d.nameTr],['nameEn',t.en,d.nameEn],['nameRu',t.ru,d.nameRu]]
    .map(([key,label,value])=>'<label>'+esc(label)+
      '<input name="'+key+'" type="text" maxlength="100" required value="'+esc(value)+'"></label>').join("")+
  '<label>'+esc(t.price)+'<input name="priceTry" type="number" inputmode="numeric" min="1" max="9999" step="1" value="'+esc(d.priceTry)+'" required></label>'+
  valueField("imageId",d.imageId??"")+
  '<button type="submit">'+esc(t.save)+'</button></form></section>';
 const photoForm='<section class="panel"><h2>'+esc(t.photo)+'</h2>'+
  '<form method="POST" action="/owner/catalog/upload" enctype="multipart/form-data">'+shared+
  '<label>'+esc(t.upload)+'<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required></label>'+
  '<p class="muted">'+esc(t.photoInfo)+'</p>'+
  '<button type="submit">'+esc(t.upload)+'</button></form></section>';
 const changes=history.map(h=>'<div class="history"><span class="badge">v'+h.revision+'</span>'+
  '<time>'+esc(new Date(h.happened_at).toISOString().slice(0,16))+' UTC</time>'+
  '<span>'+esc(h.action)+'</span>'+
  '<form method="POST" action="/owner/catalog/restore">'+shared+
  valueField("auditId",h.id)+
  '<button type="submit" class="secondary">'+esc(t.restore)+'</button></form></div>').join("");
 const historyPanel='<section class="panel"><h2>'+esc(t.history)+'</h2>'+
   (changes||'<p class="muted">'+esc(t.empty)+'</p>')+'</section>';
 const photo='/'+p.image.replace(/^\/+/,"");
 return shell(lang,'<a href="/owner/catalog?lang='+lang+'">'+esc(t.browse)+'</a>'+
   '<h1>'+esc(d.nameTr)+'</h1><p class="warning">'+esc(t.warning)+'</p>'+
   '<section class="product"><div><div class="panel"><img src="'+esc(assetLink(entry))+'" alt="'+esc(d.nameTr)+'">'+
   '<p class="muted">'+esc(d.imageId?'Private draft photograph':t.original)+'</p>'+
   '<p class="muted">'+esc(t.current)+': '+esc(p.price)+' ₺</p>'+
   '<a href="'+esc(photo)+'" rel="noopener">'+esc(t.original)+'</a></div></div>'+
   '<div>'+mainForm+photoForm+historyPanel+'</div></section>');
}
