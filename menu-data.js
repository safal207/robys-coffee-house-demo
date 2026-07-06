export const menuCopy = {
  tr: {
    pageTitle: "Tam Menü",
    pageLead: "Kahveler, soğuk içecekler, çaylar, tatlılar ve atıştırmalıklar.",
    back: "Kafeye dön",
    searchLabel: "Menüde ara",
    searchPlaceholder: "Kahve, tatlı veya içecek ara",
    all: "Tümü",
    noResults: "Aramanıza uygun ürün bulunamadı.",
    priceNote: "Fiyatlar fotoğraflanan basılı menüden alınmıştır ve değişebilir.",
    route: "Yol tarifi al",
    categories: "Menü kategorileri"
  },
  en: {
    pageTitle: "Full Menu",
    pageLead: "Coffee, cold drinks, teas, desserts and easy bites.",
    back: "Back to café",
    searchLabel: "Search the menu",
    searchPlaceholder: "Search coffee, dessert or drink",
    all: "All",
    noResults: "No menu items match your search.",
    priceNote: "Prices are based on the photographed printed menu and may change.",
    route: "Get directions",
    categories: "Menu categories"
  },
  ru: {
    pageTitle: "Полное меню",
    pageLead: "Кофе, холодные напитки, чай, десерты и лёгкие закуски.",
    back: "Вернуться на сайт",
    searchLabel: "Поиск по меню",
    searchPlaceholder: "Найти кофе, десерт или напиток",
    all: "Все",
    noResults: "По вашему запросу ничего не найдено.",
    priceNote: "Цены перенесены с сфотографированного печатного меню и могут измениться.",
    route: "Построить маршрут",
    categories: "Категории меню"
  }
};

export const menuCategories = [
  {
    id: "pairing-offers",
    icon: "✨",
    name: { tr: "Taste Journey Eşleşmeleri", en: "Taste Journey Pairings", ru: "Сочетания Taste Journey" },
    lead: { tr: "Anınız için seçilmiş içecek ve tatlı eşleşmeleri.", en: "Drink and dessert pairings selected for your moment.", ru: "Идеальные сочетания напитков и десертов для вашего момента." },
    items: [

{
  id: "cool-lime-macaron-pairing",
  journeyId: "cool-lime-macaron",
  pricingMode: "approved-offer",
  name: { tr: "Cool Lime + Makaron", en: "Cool Lime + Macaron", ru: "Cool Lime + макарон" },
  description: {
    tr: "Ferah lime ve yumuşak fıstıklı makaron.",
    en: "Bright lime and a delicate pistachio macaron.",
    ru: "Освежающий лайм и нежный фисташковый макарон."
  },
  image: "src/pairings-data/final/cool-lime-macaron-hq.webp",
  imageAlt: {
    tr: "Buzlu Cool Lime ve fıstıklı makaron",
    en: "Iced Cool Lime with a pistachio macaron",
    ru: "Cool Lime со льдом и фисташковый макарон"
  },
  price: 290
},

{
  id: "iced-san-sebastian-pairing",
  journeyId: "iced-san-sebastian",
  pricingMode: "menu-total",
  name: { tr: "Buzlu Latte + San Sebastian", en: "Iced Latte + San Sebastian Cheesecake", ru: "Айс-латте + чизкейк Сан-Себастьян" },
  description: {
    tr: "Klasik buzlu latte ve kremamsı San Sebastian.",
    en: "Classic iced latte with creamy San Sebastian cheesecake.",
    ru: "Классический айс-латте и кремовый чизкейк Сан-Себастьян."
  },
  image: "src/pairings-data/approved/iced-san-sebastian-hq.png",
  imageAlt: {
    tr: "Buzlu latte ve San Sebastian cheesecake",
    en: "Iced latte with San Sebastian cheesecake",
    ru: "Айс-латте и чизкейк Сан-Себастьян"
  },
  price: 370
}
    ]
  },
  {
    id: "hot-coffee",
    icon: "☕",
    name: { tr: "Sıcak Kahveler", en: "Hot Coffee", ru: "Горячий кофе" },
    items: [
      { name: { tr: "Espresso", en: "Espresso", ru: "Эспрессо" }, price: 110 },
      { name: { tr: "Americano", en: "Americano", ru: "Американо" }, price: 160 },
      { name: { tr: "Espresso Macchiato", en: "Espresso Macchiato", ru: "Эспрессо макиато" }, price: 170 },
      { name: { tr: "Cortado", en: "Cortado", ru: "Кортадо" }, price: 170 },
      { name: { tr: "Flat White", en: "Flat White", ru: "Флэт уайт" }, price: 170 },
      { name: { tr: "Cappuccino", en: "Cappuccino", ru: "Капучино" }, price: 180 },
      { name: { tr: "Caramel Cappuccino", en: "Caramel Cappuccino", ru: "Карамельный капучино" }, price: 200 },
      { name: { tr: "Caffè Latte", en: "Caffè Latte", ru: "Кафе латте" }, price: 180 },
      { name: { tr: "Chocolate Cookie Latte", en: "Chocolate Cookie Latte", ru: "Латте «Шоколадное печенье»" }, price: 200 },
      { name: { tr: "Cinnamon Latte", en: "Cinnamon Latte", ru: "Латте с корицей" }, price: 200 },
      { name: { tr: "Caramel Latte", en: "Caramel Latte", ru: "Карамельный латте" }, price: 200 },
      { name: { tr: "Vanilla Latte", en: "Vanilla Latte", ru: "Ванильный латте" }, price: 200 },
      { name: { tr: "Fındıklı Latte", en: "Hazelnut Latte", ru: "Ореховый латте" }, price: 200 },
      { name: { tr: "Caffè Mocca", en: "Caffè Mocha", ru: "Кафе мокка" }, price: 200 },
      { name: { tr: "White Chocolate Mocca", en: "White Chocolate Mocha", ru: "Мокка с белым шоколадом" }, price: 200 }
    ]
  },
  {
    id: "brew-hot",
    icon: "🫖",
    name: { tr: "Demleme ve Sıcak İçecekler", en: "Brewed & Hot Drinks", ru: "Заварной кофе и горячие напитки" },
    items: [
      { name: { tr: "Filtre Kahve", en: "Filter Coffee", ru: "Фильтр-кофе" }, price: 160 },
      { name: { tr: "Türk Kahvesi", en: "Turkish Coffee", ru: "Кофе по-турецки" }, price: 90 },
      { name: { tr: "Siyah Çay", en: "Black Tea", ru: "Чёрный чай" }, price: 50 },
      { name: { tr: "Sıcak Çikolata", en: "Hot Chocolate", ru: "Горячий шоколад" }, price: 200 },
      { name: { tr: "Süt", en: "Milk", ru: "Молоко" }, price: 60 },
      { name: { tr: "Salep", en: "Salep", ru: "Салеп" }, price: 200 },
      { name: { tr: "Chai Tea Latte", en: "Chai Tea Latte", ru: "Чай-латте" }, price: 200 }
    ]
  },
  {
    id: "cold-coffee",
    icon: "🧊",
    name: { tr: "Soğuk Kahveler", en: "Cold Coffee", ru: "Холодный кофе" },
    items: [
      { name: { tr: "Buzlu Filtre Kahve", en: "Iced Filter Coffee", ru: "Холодный фильтр-кофе" }, price: 170 },
      { name: { tr: "Buzlu Americano", en: "Iced Americano", ru: "Айс американо" }, price: 170 },
      { name: { tr: "Buzlu Caffè Latte", en: "Iced Caffè Latte", ru: "Айс латте" }, price: 180 },
      {
        name: { tr: "Aromalı Buzlu Caffè Latte", en: "Flavoured Iced Caffè Latte", ru: "Айс латте со вкусом" },
        description: {
          tr: "Karamel · Vanilya · Chocolate Cookie · Fındık · Tarçın",
          en: "Caramel · Vanilla · Chocolate Cookie · Hazelnut · Cinnamon",
          ru: "Карамель · Ваниль · Шоколадное печенье · Фундук · Корица"
        },
        price: 200
      },
      { name: { tr: "Buzlu Mocca", en: "Iced Mocha", ru: "Айс мокка" }, price: 200 },
      { name: { tr: "White Chocolate Mocca", en: "White Chocolate Mocha", ru: "Мокка с белым шоколадом" }, price: 200 },
      {
        name: { tr: "Caffè Latte Frappe", en: "Caffè Latte Frappe", ru: "Кафе латте фраппе" },
        description: {
          tr: "Karamel · Vanilya · Chocolate Cookie · Tarçın · Fındık · Çikolata · White Chocolate",
          en: "Caramel · Vanilla · Chocolate Cookie · Cinnamon · Hazelnut · Chocolate · White Chocolate",
          ru: "Карамель · Ваниль · Шоколадное печенье · Корица · Фундук · Шоколад · Белый шоколад"
        },
        price: 220
      },
      {
        name: { tr: "Milkshake", en: "Milkshake", ru: "Милкшейк" },
        description: {
          tr: "Vanilya · Çilek · Mango · Çikolata",
          en: "Vanilla · Strawberry · Mango · Chocolate",
          ru: "Ваниль · Клубника · Манго · Шоколад"
        },
        price: 220
      }
    ]
  },
  {
    id: "refreshers",
    icon: "🍹",
    name: { tr: "Refreshers ve Frozens", en: "Refreshers & Frozens", ru: "Освежающие напитки и фрозены" },
    groups: [
      {
        label: { tr: "Refreshers", en: "Refreshers", ru: "Освежающие напитки" },
        items: [
          { name: { tr: "Cool Lime", en: "Cool Lime", ru: "Cool Lime" }, price: 190 },
          { name: { tr: "Berry Hibiskus", en: "Berry Hibiscus", ru: "Ягодный гибискус" }, price: 190 },
          { name: { tr: "Mango Passionfruit", en: "Mango Passionfruit", ru: "Манго-маракуйя" }, price: 190 },
          { name: { tr: "Berry Lemonade", en: "Berry Lemonade", ru: "Ягодный лимонад" }, price: 190 },
          { name: { tr: "Pineapple Berry", en: "Pineapple Berry", ru: "Ананас с ягодами" }, price: 190 },
          { name: { tr: "Summer Pine", en: "Summer Pine", ru: "Summer Pine" }, price: 190 }
        ]
      },
      {
        label: { tr: "Frozens", en: "Frozens", ru: "Фрозены" },
        items: [
          { name: { tr: "Tropical Mango", en: "Tropical Mango", ru: "Тропический манго" }, price: 220 },
          { name: { tr: "Strawberry & Lime", en: "Strawberry & Lime", ru: "Клубника и лайм" }, price: 220 },
          { name: { tr: "Yuzu Popcorn", en: "Yuzu Popcorn", ru: "Юдзу-попкорн" }, price: 220 }
        ]
      }
    ]
  },
  {
    id: "herbal-tea",
    icon: "🌿",
    name: { tr: "Bitki Çayları", en: "Herbal Tea", ru: "Травяной чай" },
    items: [
      {
        name: { tr: "Beauty Tea / Çiçeksi Beyaz Çay", en: "Beauty Tea / Floral White Tea", ru: "Beauty Tea / Цветочный белый чай" },
        description: {
          tr: "Beyaz çay, gül yaprakları, yasemin, vanilya",
          en: "White tea, rose petals, jasmine, vanilla",
          ru: "Белый чай, лепестки розы, жасмин, ваниль"
        },
        price: 130
      },
      {
        name: { tr: "Tahiti Tea / Hibiskuslu Limonotu", en: "Tahiti Tea / Hibiscus Lemongrass", ru: "Tahiti Tea / Гибискус и лемонграсс" },
        description: {
          tr: "Honeybush, hibiskus, limon otu, elma, kuşburnu, aspir, ananas, tarçın, portakal kabuğu, çilek, limon",
          en: "Honeybush, hibiscus, lemongrass, apple, rosehip, safflower, pineapple, cinnamon, orange peel, strawberry, lemon",
          ru: "Ханибуш, гибискус, лемонграсс, яблоко, шиповник, сафлор, ананас, корица, апельсиновая цедра, клубника, лимон"
        },
        price: 130
      },
      {
        name: { tr: "Maroc Tea / Naneli Yeşil Çay", en: "Maroc Tea / Mint Green Tea", ru: "Maroc Tea / Зелёный чай с мятой" },
        description: {
          tr: "Yeşil çay, siyah çay, nane, papatya, bergamot, gül",
          en: "Green tea, black tea, mint, chamomile, bergamot, rose",
          ru: "Зелёный и чёрный чай, мята, ромашка, бергамот, роза"
        },
        price: 130
      },
      {
        name: { tr: "Relax Tea / Lavantalı Rooibos Çay", en: "Relax Tea / Lavender Rooibos", ru: "Relax Tea / Ройбуш с лавандой" },
        description: {
          tr: "Rooibos, papatya, lavanta, nergis çiçeği, aroma, elma, vanilya",
          en: "Rooibos, chamomile, lavender, narcissus flower, flavouring, apple, vanilla",
          ru: "Ройбуш, ромашка, лаванда, нарцисс, ароматизатор, яблоко, ваниль"
        },
        price: 130
      },
      {
        name: { tr: "Balance Tea / Detoks Yeşil Çay", en: "Balance Tea / Detox Green Tea", ru: "Balance Tea / Детокс-зелёный чай" },
        description: {
          tr: "Yeşil çay, limon otu, yerba mate, portakal kabuğu",
          en: "Green tea, lemongrass, yerba mate, orange peel",
          ru: "Зелёный чай, лемонграсс, йерба мате, апельсиновая цедра"
        },
        price: 130
      }
    ]
  },
  {
    id: "desserts",
    icon: "🍰",
    name: { tr: "Tatlılar", en: "Desserts", ru: "Десерты" },
    items: [
      { name: { tr: "San Sebastian", en: "San Sebastian Cheesecake", ru: "Чизкейк Сан-Себастьян" }, price: 190 },
      { name: { tr: "Lotus Cheesecake", en: "Lotus Cheesecake", ru: "Чизкейк Lotus" }, price: 190 },
      { name: { tr: "Frambuazlı Cheesecake", en: "Raspberry Cheesecake", ru: "Малиновый чизкейк" }, price: 190 },
      { name: { tr: "Çikolatalı Pasta", en: "Chocolate Cake", ru: "Шоколадный торт" }, price: 190 },
      { name: { tr: "Bademli Turta", en: "Almond Tart", ru: "Миндальный тарт" }, price: 180 },
      { name: { tr: "Rulo Pasta", en: "Cake Roll", ru: "Бисквитный рулет" }, price: 170 },
      { name: { tr: "Mozaik Pasta", en: "Mosaic Cake", ru: "Мозаичный торт" }, price: 170 },
      { name: { tr: "Tiramisu", en: "Tiramisu", ru: "Тирамису" }, price: 170 },
      { name: { tr: "Brownie", en: "Brownie", ru: "Брауни" }, price: 150 },
      { name: { tr: "Tuzlu Kurabiye", en: "Savoury Cookie", ru: "Солёное печенье" }, price: 130 },
      { name: { tr: "Cookie", en: "Cookie", ru: "Печенье" }, price: 100 },
      { name: { tr: "Makaron", en: "Macaron", ru: "Макарон" }, price: 30 }
    ]
  },
  {
    id: "food",
    icon: "🥐",
    name: { tr: "Kruvasan ve Sandviçler", en: "Croissants & Sandwiches", ru: "Круассаны и сэндвичи" },
    groups: [
      {
        label: { tr: "Kruvasan", en: "Croissants", ru: "Круассаны" },
        items: [
          { name: { tr: "Üç Peynirli Kruvasan", en: "Three-Cheese Croissant", ru: "Круассан с тремя сырами" }, price: 170 },
          { name: { tr: "Nutellalı Kruvasan", en: "Nutella Croissant", ru: "Круассан с Nutella" }, price: 170 }
        ]
      },
      {
        label: { tr: "Sandviçler", en: "Sandwiches", ru: "Сэндвичи" },
        items: [
          { name: { tr: "Beyaz Peynirli Baget Sandviç", en: "White Cheese Baguette Sandwich", ru: "Багет с белым сыром" }, price: 180 },
          { name: { tr: "Dana Kontrfile Baget Sandviç", en: "Beef Sirloin Baguette Sandwich", ru: "Багет с говяжьим контрфиле" }, price: 230 },
          { name: { tr: "Susamlı Simit", en: "Sesame Simit", ru: "Симит с кунжутом" }, price: 35 }
        ]
      }
    ]
  }
];
