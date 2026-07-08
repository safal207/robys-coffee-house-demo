export const menuCopy = {
  tr: {
    pageTitle: "Roby's Dünyaları",
    pageLead: "Önce vitrinden ilham alın, sonra ruh hâlinize uygun Roby's dünyasına geçin.",
    back: "Kafeye dön",
    searchLabel: "Menüde ara",
    searchPlaceholder: "Kahve, tatlı, dünya veya etiket ara",
    all: "Tümü",
    noResults: "Aramanıza uygun seçim bulunamadı.",
    priceNote: "Fiyatlar örnek menü yapısı içindir ve işletme tarafından güncellenebilir.",
    route: "Yol tarifi al",
    categories: "Roby's dünyaları"
  },
  en: {
    pageTitle: "Roby's Worlds",
    pageLead: "Start with the signature showcase, then move into the Roby's world that fits your mood.",
    back: "Back to café",
    searchLabel: "Search the menu",
    searchPlaceholder: "Search coffee, dessert, world or badge",
    all: "All",
    noResults: "No menu choices match your search.",
    priceNote: "Prices are part of the sample menu structure and may be updated by the café.",
    route: "Get directions",
    categories: "Roby's worlds"
  },
  ru: {
    pageTitle: "Миры Roby's",
    pageLead: "Сначала витрина хитов, затем — мир под ваше настроение: утро, сладкое, прохлада или детский выбор.",
    back: "Вернуться на сайт",
    searchLabel: "Поиск по меню",
    searchPlaceholder: "Найти кофе, десерт, мир или бейдж",
    all: "Все",
    noResults: "По вашему запросу ничего не найдено.",
    priceNote: "Цены указаны для структуры меню и могут быть обновлены заведением.",
    route: "Построить маршрут",
    categories: "Миры Roby's"
  }
};

const badges = {
  favorite: { tr: "❤️ Favorite", en: "❤️ Favorite", ru: "❤️ Favorite" },
  hit: { tr: "🔥 Haftanın hiti", en: "🔥 Hit of the week", ru: "🔥 Хит недели" },
  takeaway: { tr: "🥡 Paket servis", en: "🥡 Takeaway", ru: "🥡 с собой" },
  family: { tr: "👨‍👩‍👧‍👦 Aile seçimi", en: "👨‍👩‍👧‍👦 Family choice", ru: "👨‍👩‍👧‍👦 выбор семей" }
};

export const menuCategories = [
  {
    id: "robys-signature",
    type: "entry",
    icon: "✨",
    accent: "#d32636",
    name: { tr: "Roby's Signature", en: "Roby's Signature", ru: "Roby's Signature" },
    lead: {
      tr: "Vitrin: dört hit seçim. Her kart sizi doğru dünyaya götürür.",
      en: "The showcase: four hit choices. Each card leads into the right world.",
      ru: "Витрина: 4 хита, которые сразу ведут в нужный мир."
    },
    items: [
      {
        id: "signature-cappuccino-san-sebastian",
        journeyId: "signature-san-sebastian",
        targetCategory: "sweet-robys",
        name: {
          tr: "Cappuccino + San Sebastian",
          en: "Cappuccino + San Sebastian",
          ru: "Cappuccino + Сан-Себастьян"
        },
        description: {
          tr: "Kadifemsi köpük ve hafif yanık cheesecake kabuğu. Uzatmaya değer bir mola.",
          en: "Velvety foam and the torched edge of cheesecake. A pause worth stretching.",
          ru: "Бархатная пенка и подпалённая корочка чизкейка. Пауза, которую стоит растянуть."
        },
        badges: [badges.favorite],
        image: "src/products/cards/pairing-iced-san-sebastian.webp",
        imageAlt: {
          tr: "Cappuccino ve San Sebastian cheesecake",
          en: "Cappuccino and San Sebastian cheesecake",
          ru: "Капучино и чизкейк Сан-Себастьян"
        },
        price: 320
      },
      {
        id: "signature-flat-white-croissant",
        journeyId: "signature-croissant",
        targetCategory: "morning-robys",
        name: {
          tr: "Flat White + Kruvasan",
          en: "Flat White + Croissant",
          ru: "Флэт уайт + круассан"
        },
        description: {
          tr: "Çıtır katlar ve net kahve. Acele etmeyen sabahlar için.",
          en: "Crisp layers and a clean cup. Built for mornings without hurry.",
          ru: "Хрустящие слои и собранный кофе — утро без спешки."
        },
        badges: [badges.hit],
        image: "src/products/gallery-v5/croissant-828.webp",
        imageAlt: {
          tr: "Kruvasan ve kahve",
          en: "Croissant and coffee",
          ru: "Круассан и кофе"
        },
        price: 260
      },
      {
        id: "signature-mint-lemonade",
        journeyId: "signature-fresh",
        targetCategory: "fresh-robys",
        name: {
          tr: "Naneli ev limonatası",
          en: "Homemade mint lemonade",
          ru: "Домашний лимонад с мятой"
        },
        description: {
          tr: "Nane ve hafif ekşilik — beklediğinizden hızlı ferahlatır.",
          en: "Mint and a light tang — refreshing faster than you expect.",
          ru: "Мята и лёгкая кислинка — освежает быстрее, чем ждёшь."
        },
        badges: [badges.hit],
        image: "src/products/cards/pairing-cool-lime-macaron.webp",
        imageAlt: {
          tr: "Buzlu ferahlatıcı içecek",
          en: "Iced refreshing drink",
          ru: "Освежающий напиток со льдом"
        },
        price: 280
      },
      {
        id: "signature-mini-pancakes-juice",
        targetCategory: "kids-robys",
        name: {
          tr: "Mini Pancakes + Meyve suyu",
          en: "Mini Pancakes + Juice",
          ru: "Mini Pancakes + сок"
        },
        description: {
          tr: "Pankek kulesi ve meyve suyu — çocuk meşgul, siz kahvenizi sakince bitirirsiniz.",
          en: "A stack of pancakes and juice — the child is busy, you finish your coffee in peace.",
          ru: "Стопка панкейков и сок — ребёнок занят, вы спокойно допиваете кофе."
        },
        badges: [badges.takeaway],
        price: 240
      }
    ]
  },
  {
    id: "morning-robys",
    type: "world",
    icon: "🟠",
    accent: "#F2A93B",
    name: { tr: "Morning Roby's", en: "Morning Roby's", ru: "Morning Roby's" },
    lead: {
      tr: "Acele etmeyi sevmeyenler için.",
      en: "For people who do not like to rush.",
      ru: "Для тех, кто не любит спешить."
    },
    items: [
      {
        name: { tr: "Flat White + Kruvasan", en: "Flat White + Croissant", ru: "Флэт уайт + круассан" },
        description: {
          tr: "Çıtır kabuk ve yumuşak kahve — telaşsız bir başlangıç.",
          en: "A crisp crust and a calm coffee — a start without rush.",
          ru: "Хрустящая корочка и мягкий кофе — начало без спешки."
        },
        badges: [badges.hit],
        price: 260
      },
      {
        name: { tr: "Omlet + Tost", en: "Omelette + Toast", ru: "Омлет + тост" },
        description: {
          tr: "Sade, doyurucu ve gerçekten sabah gibi.",
          en: "Simple, filling and properly morning.",
          ru: "Просто, сытно, по-настоящему утренне."
        },
        price: 340
      },
      {
        name: { tr: "Latte + Syrniki", en: "Latte + Syrniki", ru: "Латте + сырники" },
        description: {
          tr: "Sıcak ve tanıdık — her gün isteyebileceğiniz şey.",
          en: "Warm and familiar — the thing you want every day.",
          ru: "Тёплое и знакомое — то, что хочется каждый день."
        },
        price: 300
      }
    ]
  },
  {
    id: "sweet-robys",
    type: "world",
    icon: "🟤",
    accent: "#A8703F",
    name: { tr: "Sweet Roby's", en: "Sweet Roby's", ru: "Sweet Roby's" },
    lead: {
      tr: "Buna değen küçük bir zaaf.",
      en: "A small weakness that is worth it.",
      ru: "Маленькая слабость, которая того стоит."
    },
    items: [
      {
        name: { tr: "Cappuccino + San Sebastian", en: "Cappuccino + San Sebastian", ru: "Cappuccino + Сан-Себастьян" },
        description: {
          tr: "Kadifemsi köpük ve hafif yanık cheesecake kabuğu. Uzatmaya değer bir mola.",
          en: "Velvety foam and the torched edge of cheesecake. A pause worth stretching.",
          ru: "Бархатная пенка и подпалённая корочка чизкейка. Пауза, которую стоит растянуть."
        },
        badges: [badges.favorite],
        price: 320
      },
      {
        name: { tr: "Espresso + Tiramisu", en: "Espresso + Tiramisu", ru: "Эспрессо + тирамису" },
        description: {
          tr: "Tatlıya güçlü bir kontrast — her zaman çalışan klasik.",
          en: "A strong contrast to sweetness — a classic that always works.",
          ru: "Крепкий контраст сладкому — классика, которая работает всегда."
        },
        price: 310
      },
      {
        name: { tr: "Çay + Çikolatalı fondan", en: "Tea + Chocolate fondant", ru: "Чай + шоколадный фондан" },
        description: {
          tr: "İçindeki sıcak merkez — son kaşığa kadar beklenen tatlı.",
          en: "A warm centre inside — the dessert you wait for until the last spoon.",
          ru: "Тёплый центр внутри — десерт, который ждёшь до последней ложки."
        },
        price: 290
      }
    ]
  },
  {
    id: "fresh-robys",
    type: "world",
    icon: "🟢",
    accent: "#4CB99A",
    name: { tr: "Fresh Roby's", en: "Fresh Roby's", ru: "Fresh Roby's" },
    lead: {
      tr: "Her an için bir yudum serinlik.",
      en: "A sip of coolness at any time.",
      ru: "Глоток прохлады в любое время."
    },
    items: [
      {
        name: { tr: "Naneli ev limonatası", en: "Homemade mint lemonade", ru: "Домашний лимонад с мятой" },
        description: {
          tr: "Nane ve hafif ekşilik — beklediğinizden hızlı ferahlatır.",
          en: "Mint and a light tang — refreshing faster than you expect.",
          ru: "Мята и лёгкая кислинка — освежает быстрее, чем ждёшь."
        },
        badges: [badges.hit],
        price: 280
      },
      {
        name: { tr: "Buzlu Latte + Muffin", en: "Iced Latte + Muffin", ru: "Айс-латте + маффин" },
        description: {
          tr: "Soğuk kahve ve yanında tatlı bir şey — sıcak gün dengesi.",
          en: "Cold coffee and something sweet beside it — balance for a hot day.",
          ru: "Холодный кофе и что-то сладкое рядом — баланс на жаркий день."
        },
        price: 300
      },
      {
        name: { tr: "Orman meyveli smoothie", en: "Berry smoothie", ru: "Ягодный смузи" },
        description: {
          tr: "Hızlı, parlak, fazla şekersiz.",
          en: "Fast, bright and not over-sugared.",
          ru: "Быстро, ярко, без лишнего сахара."
        },
        badges: [badges.takeaway],
        price: 260
      }
    ]
  },
  {
    id: "kids-robys",
    type: "world",
    icon: "🔵",
    accent: "#5DADE2",
    name: { tr: "Kids Roby's", en: "Kids Roby's", ru: "Kids Roby's" },
    lead: {
      tr: "Lezzetli ve sade; yetişkinlere biraz sessizlik.",
      en: "Tasty and simple; a little quiet for adults.",
      ru: "Вкусно и просто, взрослым — тишина."
    },
    items: [
      {
        name: { tr: "Mini Pancakes + Meyve suyu", en: "Mini Pancakes + Juice", ru: "Mini Pancakes + сок" },
        description: {
          tr: "Pankek kulesi ve meyve suyu — çocuk meşgul, siz kahvenizi sakince bitirirsiniz.",
          en: "A stack of pancakes and juice — the child is busy, you finish your coffee in peace.",
          ru: "Стопка панкейков и сок — ребёнок занят, вы спокойно допиваете кофе."
        },
        badges: [badges.takeaway],
        price: 240
      },
      {
        name: { tr: "Milkshake + Kurabiye", en: "Milkshake + Cookie", ru: "Молочный коктейль + печенье" },
        description: {
          tr: "Sürprizsiz basit bir keyif — çocuklar ilk seferde sever.",
          en: "A simple treat with no surprises — kids like it from the first try.",
          ru: "Простое лакомство без сюрпризов — детям нравится с первого раза."
        },
        badges: [badges.family],
        price: 220
      }
    ]
  }
];