// Editorial mood selection, never music playback or behavioral tracking.
export const moods = Object.freeze([
  {
    "id": "morning",
    "adaptive": "fresh",
    "productId": "hot-coffee:cappuccino",
    "name": [
      "Güne başlarken",
      "Morning ritual",
      "Просыпаюсь"
    ],
    "description": [
      "Yumuşak caz havası",
      "Soft jazz mood",
      "Атмосфера мягкого джаза"
    ]
  },
  {
    "id": "focus",
    "adaptive": "study",
    "productId": "hot-coffee:flat-white",
    "name": [
      "Odaklanıyorum",
      "In the zone",
      "Работаю"
    ],
    "description": [
      "Lo-fi havası",
      "Lo-fi mood",
      "Атмосфера lo-fi"
    ]
  },
  {
    "id": "calm",
    "adaptive": "cozy",
    "productId": "brew-hot:turkish-coffee",
    "name": [
      "Dinleniyorum",
      "Slow moments",
      "Отдыхаю"
    ],
    "description": [
      "Sakin akustik hava",
      "Gentle acoustic mood",
      "Спокойная акустика"
    ]
  },
  {
    "id": "friends",
    "adaptive": "friends",
    "productId": "desserts:lotus-cheesecake",
    "name": [
      "Arkadaşlarla",
      "With friends",
      "С друзьями"
    ],
    "description": [
      "Soul havası",
      "Soul mood",
      "Атмосфера соула"
    ]
  },
  {
    "id": "evening",
    "adaptive": "cozy",
    "productId": "brew-hot:hot-chocolate",
    "name": [
      "Akşam molası",
      "Evening pause",
      "Вечер"
    ],
    "description": [
      "Sıcak lounge havası",
      "Warm lounge mood",
      "Тёплая lounge-атмосфера"
    ]
  }
].map(Object.freeze));
export const languages = Object.freeze(["tr","en","ru"]);
export function resolveMood(id, products) {
  const mood=moods.find(m=>m.id===id);
  if(!mood) return null;
  const product=products.find(p=>p.id===mood.productId)??null;
  return {mood,product,playbackEnabled:false,providerLinksEnabled:false,stockVerified:false};
}
export const providers=Object.freeze(["Spotify","Yandex Music"]);

// Only guest-selected editorial codes. No provider metadata or app detection.
export const musicStyles=Object.freeze([{"id":"auto","name":["Ana göre","By moment","По настроению"],"productId":null},{"id":"rock","name":["Rock","Rock","Рок"],"productId":"hot-coffee:espresso"},{"id":"jazz","name":["Caz","Jazz","Джаз"],"productId":"hot-coffee:cappuccino"},{"id":"lofi","name":["Lo-fi","Lo-fi","Lo-fi"],"productId":"hot-coffee:flat-white"},{"id":"acoustic","name":["Akustik","Acoustic","Акустика"],"productId":"brew-hot:turkish-coffee"},{"id":"soul","name":["Soul","Soul","Соул"],"productId":"desserts:lotus-cheesecake"}].map(Object.freeze));
export const layouts=Object.freeze([{"id":"classic","name":["Klasik","Classic","Классика"]},{"id":"reels","name":["Kısa akış","Short feed","Вертикальная лента"]},{"id":"gallery","name":["Fotoğraf duvarı","Photo wall","Фотогалерея"]},{"id":"channels","name":["Koleksiyonlar","Collections","Подборки"]}].map(Object.freeze));
export function livingContext(selection,products){
 if(!selection||Object.keys(selection).sort().join(",")!=="layout,mood,music"||
 !layouts.some(x=>x.id===selection.layout)||!musicStyles.some(x=>x.id===selection.music))return null;
 const moment=resolveMood(selection.mood,products);
 if(!moment)return null;
 const style=musicStyles.find(x=>x.id===selection.music);
 const product=style.productId===null?moment.product:products.find(p=>p.id===style.productId)??null;
 const shelf=moods.flatMap(m=>{const item=products.find(p=>p.id===m.productId);return item?[{mood:m,product:item}]:[]});
 return {mood:moment.mood,style,layout:selection.layout,product,shelf,
  adaptiveMood:moment.mood.adaptive,source:"explicit-guest-choice",retained:false,
  deviceAppsRead:false,musicDataRead:false,stockVerified:false,playbackEnabled:false,providerLinksEnabled:false};
}
