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
