import { addOrderGroup } from "./order-draft.js";

// Editorial starting points: current catalog products, ordinary prices, no new sale SKUs.
export const MAX_COMBO_QUANTITY = 20;
export const comboRecipes = [
  {
    "id": "student",
    "name": {
      "tr": "Öğrenci molası",
      "en": "Study break",
      "ru": "Студенческая пауза"
    },
    "eyebrow": {
      "tr": "Küçük bir ara",
      "en": "A little time out",
      "ru": "Небольшой перерыв"
    },
    "guests": 1,
    "filters": [
      "pause"
    ],
    "image": "src/products/occasion-sets-v1/student.webp",
    "items": [
      {
        "id": "brew-hot:black-tea",
        "quantity": 1
      },
      {
        "id": "food:sesame-simit",
        "quantity": 1
      }
    ]
  },
  {
    "id": "cycle",
    "name": {
      "tr": "Bisiklet turu sonrası",
      "en": "After your bike ride",
      "ru": "После велопрогулки"
    },
    "eyebrow": {
      "tr": "Dur, soluklan, atıştır",
      "en": "Stop for a bite",
      "ru": "Остановиться и перекусить"
    },
    "guests": 1,
    "filters": [
      "pause"
    ],
    "image": "src/products/occasion-sets-v1/cycle.webp",
    "items": [
      {
        "id": "cold-coffee:iced-americano",
        "quantity": 1
      },
      {
        "id": "food:white-cheese-baguette-sandwich",
        "quantity": 1
      }
    ]
  },
  {
    "id": "rain",
    "name": {
      "tr": "İçini ısıt",
      "en": "Warm up",
      "ru": "Согреться"
    },
    "eyebrow": {
      "tr": "Dışarıda yağmur varken",
      "en": "For rainy days",
      "ru": "Когда за окном дождь"
    },
    "guests": 1,
    "filters": [
      "pause"
    ],
    "image": "src/products/occasion-sets-v1/rain.webp",
    "items": [
      {
        "id": "brew-hot:salep",
        "quantity": 1
      },
      {
        "id": "desserts:cookie",
        "quantity": 1
      }
    ]
  },
  {
    "id": "tea",
    "name": {
      "tr": "Çay molası",
      "en": "Tea break",
      "ru": "Чайная пауза"
    },
    "eyebrow": {
      "tr": "Kendi ritminde",
      "en": "At your own pace",
      "ru": "В своём ритме"
    },
    "guests": 1,
    "filters": [
      "pause"
    ],
    "image": "src/products/occasion-sets-v1/tea.webp",
    "items": [
      {
        "id": "herbal-tea:balance-tea-detox-green-tea",
        "quantity": 1
      },
      {
        "id": "food:sesame-simit",
        "quantity": 1
      }
    ]
  },
  {
    "id": "refresh",
    "name": {
      "tr": "Ferahla",
      "en": "Refresh your day",
      "ru": "Освежиться"
    },
    "eyebrow": {
      "tr": "Güne renk katan bir an",
      "en": "A bright little moment",
      "ru": "Яркий момент дня"
    },
    "guests": 1,
    "filters": [
      "pause"
    ],
    "image": "src/products/occasion-sets-v1/refresh.webp",
    "items": [
      {
        "id": "refreshers:cool-lime",
        "quantity": 1
      },
      {
        "id": "desserts:macaron",
        "quantity": 1
      }
    ]
  },
  {
    "id": "together",
    "name": {
      "tr": "Birlikte",
      "en": "Together",
      "ru": "Вместе"
    },
    "eyebrow": {
      "tr": "İki kişiye bir tatlı",
      "en": "One dessert to share",
      "ru": "Один десерт на двоих"
    },
    "guests": 2,
    "filters": [
      "together"
    ],
    "image": "src/products/occasion-sets-v1/together.webp",
    "items": [
      {
        "id": "hot-coffee:caffe-latte",
        "quantity": 2
      },
      {
        "id": "desserts:san-sebastian-cheesecake",
        "quantity": 1
      }
    ]
  },
  {
    "id": "family",
    "name": {
      "tr": "Çocuklarla 2 + 2",
      "en": "Family time 2 + 2",
      "ru": "С детьми 2 + 2"
    },
    "eyebrow": {
      "tr": "2 yetişkin + 2 çocuk",
      "en": "2 adults + 2 children",
      "ru": "2 взрослых + 2 ребёнка"
    },
    "guests": 4,
    "filters": [
      "family",
      "together"
    ],
    "image": "src/products/occasion-sets-v1/family.webp",
    "items": [
      {
        "id": "hot-coffee:cappuccino",
        "quantity": 2
      },
      {
        "id": "food:sesame-simit",
        "quantity": 2
      },
      {
        "id": "brew-hot:milk",
        "quantity": 2
      },
      {
        "id": "desserts:cookie",
        "quantity": 2
      }
    ]
  },
  {
    "id": "local",
    "name": {
      "tr": "Yerel tatlar",
      "en": "Local flavours",
      "ru": "Местный вкус"
    },
    "eyebrow": {
      "tr": "Tanıdık bir yer. Yeni bir keşif.",
      "en": "A familiar place. A new discovery.",
      "ru": "Знакомое место. Новое открытие."
    },
    "guests": 1,
    "filters": [
      "pause"
    ],
    "image": "src/products/occasion-sets-v1/local.webp",
    "items": [
      {
        "id": "brew-hot:turkish-coffee",
        "quantity": 1
      },
      {
        "id": "food:sesame-simit",
        "quantity": 1
      }
    ]
  },
  {
    "id": "go",
    "name": {
      "tr": "Al ve yola çık",
      "en": "Grab & go",
      "ru": "Взял и побежал"
    },
    "eyebrow": {
      "tr": "Al götür klasiği",
      "en": "A takeaway classic",
      "ru": "Классика с собой"
    },
    "guests": 1,
    "filters": [
      "takeaway"
    ],
    "image": "src/products/occasion-sets-v1/go.webp",
    "items": [
      {
        "id": "hot-coffee:americano",
        "quantity": 1
      },
      {
        "id": "food:sesame-simit",
        "quantity": 1
      }
    ]
  },
  {
    "id": "morning",
    "name": {
      "tr": "Yol üstü sabah keyfi",
      "en": "Morning on the move",
      "ru": "Утро по пути"
    },
    "eyebrow": {
      "tr": "Güne sevdiğin tatlarla başla",
      "en": "Start with a favourite",
      "ru": "Начать день с любимого"
    },
    "guests": 1,
    "filters": [
      "takeaway"
    ],
    "image": "src/products/occasion-sets-v1/morning.webp",
    "items": [
      {
        "id": "hot-coffee:cappuccino",
        "quantity": 1
      },
      {
        "id": "food:three-cheese-croissant",
        "quantity": 1
      }
    ]
  },
  {
    "id": "sweet",
    "name": {
      "tr": "Kahve ve tatlı",
      "en": "Coffee & a cookie",
      "ru": "Кофе и сладкое"
    },
    "eyebrow": {
      "tr": "Yanına küçük bir mutluluk al",
      "en": "A little treat to go",
      "ru": "Небольшая радость с собой"
    },
    "guests": 1,
    "filters": [
      "takeaway"
    ],
    "image": "src/products/occasion-sets-v1/sweet.webp",
    "items": [
      {
        "id": "hot-coffee:caffe-latte",
        "quantity": 1
      },
      {
        "id": "desserts:cookie",
        "quantity": 1
      }
    ]
  },
  {
    "id": "hearty",
    "name": {
      "tr": "Doyurucu bir mola",
      "en": "Hearty to go",
      "ru": "Сытно с собой"
    },
    "eyebrow": {
      "tr": "Canın bir şeyler atıştırmak istediğinde",
      "en": "For when you fancy a bite",
      "ru": "Когда хочется перекусить"
    },
    "guests": 1,
    "filters": [
      "takeaway"
    ],
    "image": "src/products/occasion-sets-v1/hearty.webp",
    "items": [
      {
        "id": "brew-hot:filter-coffee",
        "quantity": 1
      },
      {
        "id": "food:white-cheese-baguette-sandwich",
        "quantity": 1
      }
    ]
  }
];

export function quoteComboSelection(recipeId, selectedItems, productIndex) {
  if (!comboRecipes.some(recipe => recipe.id === recipeId) || !Array.isArray(selectedItems) || !selectedItems.length) {
    return { valid: false, products: [], total: 0 };
  }
  const seen = new Set();
  const products = [];
  for (const selected of selectedItems) {
    if (seen.has(selected?.id) || !Number.isInteger(selected?.quantity) || selected.quantity < 0 || selected.quantity > MAX_COMBO_QUANTITY) {
      return { valid: false, products: [], total: 0 };
    }
    seen.add(selected.id);
    const product = productIndex.get(selected.id);
    // Nested pairings and products requiring a flavour are chosen through the full menu.
    if (!product || product.category?.id === "pairing-offers" || product.item?.variants?.length ||
        !Number.isFinite(product.item?.price) || product.item.price <= 0) {
      return { valid: false, products: [], total: 0 };
    }
    if (selected.quantity) products.push({ ...product, quantity: selected.quantity });
  }
  return { valid: products.length > 0, products,
    total: products.reduce((sum, product) => sum + product.item.price * product.quantity, 0) };
}

export function stageComboSelection(draft, recipeId, selectedItems, productIndex, validIds) {
  const quote = quoteComboSelection(recipeId, selectedItems, productIndex);
  if (!quote.valid) return { applied: false, draft, quote };
  let staged = draft;
  // One atomic shared-draft transaction; each component remains independently editable.
  for (const product of quote.products) {
    const result = addOrderGroup(staged, [{ id: product.id, quantity: 1 }], product.quantity, validIds);
    if (!result.applied) return { applied: false, draft, quote };
    staged = result.draft;
  }
  return { applied: true, draft: staged, quote };
}
