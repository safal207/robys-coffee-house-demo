import { nutritionPortions, nutritionPairs, calorieLabel } from "./menu-nutrition-summary.js";

const words = {
  coffee: ["Kahve", "Coffee", "Кофе"], water: ["Su", "Water", "Вода"], espresso: ["Espresso", "Espresso", "Эспрессо"],
  milk: ["İnek sütü", "Cow’s milk", "Коровье молоко"], foam: ["Süt köpüğü", "Milk foam", "Молочная пена"],
  ice: ["Buz", "Ice", "Лёд"], tea: ["Siyah çay", "Black tea", "Чёрный чай"],
  caramel: ["Karamel şurubu", "Caramel syrup", "Карамельный сироп"], vanilla: ["Vanilya şurubu", "Vanilla syrup", "Ванильный сироп"],
  hazelnut: ["Fındık aromalı şurup", "Hazelnut-flavoured syrup", "Сироп со вкусом фундука"],
  cinnamon: ["Tarçın veya tarçın şurubu", "Cinnamon or cinnamon syrup", "Корица или сироп с корицей"],
  cookieFlavor: ["Kurabiye aromalı şurup veya sos", "Cookie-flavoured syrup or sauce", "Сироп или соус со вкусом печенья"],
  cocoa: ["Kakao veya çikolata sosu", "Cocoa or chocolate sauce", "Какао или шоколадный соус"],
  whiteChocolate: ["Beyaz çikolata sosu", "White chocolate sauce", "Соус из белого шоколада"],
  sugar: ["Şeker", "Sugar", "Сахар"], salep: ["Salep karışımı", "Salep mix", "Смесь для салепа"],
  spices: ["Baharatlı çay bazı", "Spiced tea base", "Пряная чайная основа"],
  flavor: ["Seçilen lezzetin bazı", "Selected flavour base", "Основа выбранного вкуса"],
  frappe: ["Frappe bazı", "Frappe base", "Основа для фраппе"],
  iceCream: ["Dondurma", "Ice cream", "Мороженое"],
  limeBase: ["Lime aromalı içecek bazı", "Lime drink base", "Основа напитка со вкусом лайма"],
  berryBase: ["Orman meyvesi bazı", "Berry base", "Ягодная основа"],
  hibiscus: ["Hibiskus bazı", "Hibiscus base", "Основа гибискуса"],
  mangoBase: ["Mango bazı", "Mango base", "Основа манго"],
  passionBase: ["Çarkıfelek meyvesi bazı", "Passionfruit base", "Основа маракуйи"],
  lemonBase: ["Limonata bazı", "Lemonade base", "Основа лимонада"],
  pineappleBase: ["Ananas bazı", "Pineapple base", "Основа ананаса"],
  summerBase: ["Summer Pine bazı; içeriği kafede sorulmalı", "Summer Pine base; ask the café for its ingredients", "Основа Summer Pine; состав уточните в кафе"],
  strawberryBase: ["Çilek bazı", "Strawberry base", "Клубничная основа"],
  yuzuBase: ["Yuzu bazı", "Yuzu base", "Основа юдзу"],
  popcornBase: ["Popcorn aromalı baz", "Popcorn-flavoured base", "Основа со вкусом попкорна"],
  creamCheese: ["Krem peynir", "Cream cheese", "Сливочный сыр"], cream: ["Krema", "Cream", "Сливки"],
  egg: ["Yumurta", "Egg", "Яйцо"], flour: ["Buğday unu", "Wheat flour", "Пшеничная мука"],
  butter: ["Tereyağı", "Butter", "Сливочное масло"], biscuit: ["Bisküvi", "Biscuit", "Печенье"],
  lotus: ["Lotus bisküvisi ve kreması", "Lotus biscuit and spread", "Печенье и паста Lotus"],
  raspberry: ["Frambuaz sosu", "Raspberry sauce", "Малиновый соус"],
  chocolate: ["Çikolata", "Chocolate", "Шоколад"], almonds: ["Badem", "Almonds", "Миндаль"],
  filling: ["Tarife göre dolgu", "Recipe-dependent filling", "Начинка по рецепту"],
  mascarpone: ["Mascarpone", "Mascarpone", "Маскарпоне"], ladyfingers: ["Kedi dili bisküvi", "Ladyfinger biscuits", "Печенье савоярди"],
  salt: ["Tuz", "Salt", "Соль"], eggWhite: ["Yumurta akı", "Egg white", "Яичный белок"],
  croissant: ["Tereyağlı kruvasan", "Butter croissant", "Круассан на сливочном масле"],
  cheeseMix: ["Üç peynir karışımı", "Three-cheese filling", "Смесь трёх сыров"],
  nutella: ["Nutella fındık-kakao kreması", "Nutella hazelnut cocoa spread", "Орехово-шоколадная паста Nutella"],
  baguette: ["Buğday bageti", "Wheat baguette", "Пшеничный багет"],
  whiteCheese: ["Beyaz peynir", "White cheese", "Белый сыр"], beef: ["Dana kontrfile", "Beef sirloin", "Говяжье контрфиле"],
  garnish: ["Tarife göre sebze ve sos", "Recipe-dependent vegetables and sauce", "Овощи и соус по рецепту"],
  dough: ["Mayalı buğday hamuru", "Yeasted wheat dough", "Дрожжевое пшеничное тесто"],
  sesame: ["Susam", "Sesame", "Кунжут"], molasses: ["Pekmezli kaplama", "Molasses coating", "Покрытие с пекмезом"]
};

// Typical recipe models only. Herbal blends use the existing printed-menu
// descriptions instead. Never infer fruit vitamins from a flavour/syrup name.
export const nutritionRecipes = {
  "hot-coffee:espresso": ["black", "espresso"],
  "hot-coffee:americano": ["black", "espresso water"],
  "hot-coffee:espresso-macchiato": ["littleMilk", "espresso foam"],
  "hot-coffee:cortado": ["milk", "espresso milk"],
  "hot-coffee:flat-white": ["milk", "espresso milk foam"],
  "hot-coffee:cappuccino": ["milk", "espresso milk foam"],
  "hot-coffee:caramel-cappuccino": ["sweetMilk", "espresso milk foam caramel"],
  "hot-coffee:caffe-latte": ["milk", "espresso milk foam"],
  "hot-coffee:chocolate-cookie-latte": ["sweetMilk", "espresso milk cookieFlavor"],
  "hot-coffee:cinnamon-latte": ["milk", "espresso milk cinnamon"],
  "hot-coffee:caramel-latte": ["sweetMilk", "espresso milk caramel"],
  "hot-coffee:vanilla-latte": ["sweetMilk", "espresso milk vanilla"],
  "hot-coffee:hazelnut-latte": ["sweetMilk", "espresso milk hazelnut"],
  "hot-coffee:caffe-mocha": ["sweetMilk", "espresso milk cocoa"],
  "hot-coffee:white-chocolate-mocha": ["sweetMilk", "espresso milk whiteChocolate"],
  "brew-hot:filter-coffee": ["black", "coffee water"],
  "brew-hot:turkish-coffee": ["black", "coffee water"],
  "brew-hot:black-tea": ["tea", "tea water"],
  "brew-hot:hot-chocolate": ["sweetMilk", "milk cocoa sugar"],
  "brew-hot:milk": ["milk", "milk"],
  "brew-hot:salep": ["sweetMilk", "milk salep sugar cinnamon"],
  "brew-hot:chai-tea-latte": ["sweetMilk", "milk spices sugar"],
  "cold-coffee:iced-filter-coffee": ["black", "coffee water ice"],
  "cold-coffee:iced-americano": ["black", "espresso water ice"],
  "cold-coffee:iced-caffe-latte": ["milk", "espresso milk ice"],
  "cold-coffee:flavoured-iced-caffe-latte": ["sweetMilk", "espresso milk ice flavor"],
  "cold-coffee:iced-mocha": ["sweetMilk", "espresso milk ice cocoa"],
  "cold-coffee:white-chocolate-mocha": ["sweetMilk", "espresso milk ice whiteChocolate"],
  "cold-coffee:caffe-latte-frappe": ["sweetMilk", "coffee milk ice frappe flavor"],
  "cold-coffee:milkshake": ["sweetMilk", "milk iceCream flavor"],
  "refreshers:cool-lime": ["fruit", "limeBase water ice"],
  "refreshers:berry-hibiscus": ["fruit", "berryBase hibiscus water ice"],
  "refreshers:mango-passionfruit": ["fruit", "mangoBase passionBase water ice"],
  "refreshers:berry-lemonade": ["fruit", "berryBase lemonBase water ice"],
  "refreshers:pineapple-berry": ["fruit", "pineappleBase berryBase water ice"],
  "refreshers:summer-pine": ["fruit", "summerBase water ice"],
  "refreshers:tropical-mango": ["fruit", "mangoBase water ice"],
  "refreshers:strawberry-lime": ["fruit", "strawberryBase limeBase water ice"],
  "refreshers:yuzu-popcorn": ["fruit", "yuzuBase popcornBase water ice"],
  "herbal-tea:beauty-tea-floral-white-tea": ["tea", ""],
  "herbal-tea:tahiti-tea-hibiscus-lemongrass": ["tea", ""],
  "herbal-tea:maroc-tea-mint-green-tea": ["tea", ""],
  "herbal-tea:relax-tea-lavender-rooibos": ["tea", ""],
  "herbal-tea:balance-tea-detox-green-tea": ["tea", ""],
  "desserts:san-sebastian-cheesecake": ["dairyDessert", "creamCheese cream egg sugar flour"],
  "desserts:lotus-cheesecake": ["dairyDessert", "creamCheese cream lotus butter sugar"],
  "desserts:raspberry-cheesecake": ["dairyDessert", "creamCheese cream biscuit butter sugar raspberry"],
  "desserts:chocolate-cake": ["dessert", "flour egg sugar butter chocolate cream"],
  "desserts:almond-tart": ["almond", "almonds flour butter egg sugar"],
  "desserts:cake-roll": ["dessert", "flour egg sugar cream filling"],
  "desserts:mosaic-cake": ["dessert", "biscuit cocoa butter milk sugar"],
  "desserts:tiramisu": ["dairyDessert", "mascarpone ladyfingers coffee cocoa sugar egg"],
  "desserts:brownie": ["dessert", "chocolate butter egg sugar flour"],
  "desserts:savoury-cookie": ["bread", "flour butter egg salt"],
  "desserts:cookie": ["dessert", "flour butter sugar egg filling"],
  "desserts:macaron": ["almond", "almonds eggWhite sugar filling"],
  "food:three-cheese-croissant": ["cheese", "croissant cheeseMix"],
  "food:nutella-croissant": ["dessert", "croissant nutella"],
  "food:white-cheese-baguette-sandwich": ["cheese", "baguette whiteCheese garnish"],
  "food:beef-sirloin-baguette-sandwich": ["beef", "baguette beef garnish"],
  "food:sesame-simit": ["bread", "dough sesame molasses"]
};

const benefits = {
  black: ["Sade ve şekersiz örnekte enerji çok düşüktür. Kahve kafein içerir.", "Very little energy in the plain, unsweetened example. Coffee contains caffeine.", "В варианте без сахара и добавок калорий почти нет. Кофе содержит кофеин."],
  littleMilk: ["Az miktarda süt içerir; besin katkısı süt miktarına bağlıdır.", "Contains a little milk; its nutrient contribution depends on the amount.", "Небольшое количество молока; вклад питательных веществ зависит от его объёма."],
  milk: ["Süt protein ve kalsiyum sağlar; miktar süt türüne ve porsiyona bağlıdır.", "Milk contributes protein and calcium; amounts depend on milk type and portion.", "Молоко добавляет белок и кальций; количество зависит от вида молока и порции."],
  sweetMilk: ["Süt protein ve kalsiyum sağlar. Tatlı bazlar şeker ve enerji ekler.", "Milk contributes protein and calcium. Sweet bases add sugar and energy.", "Молоко добавляет белок и кальций. Сладкие основы увеличивают количество сахара и калорий."],
  tea: ["Şekersiz süzülmüş demlemede enerji çok düşüktür. Bir vitamin takviyesi olarak değerlendirilmez.", "A strained, unsweetened infusion has very little energy. It is not treated as a vitamin supplement.", "В процеженном настое без сахара калорий почти нет. Чай не рассматривается как витаминная добавка."],
  fruit: ["Serinletici bir içecek. Tatlı baz şeker ekleyebilir; meyve adı lif veya vitamin miktarını göstermez.", "A refreshing drink. Sweet bases may add sugar; a fruit name does not establish fibre or vitamin content.", "Освежающий напиток. Сладкая основа может добавлять сахар; название фрукта не определяет количество клетчатки и витаминов."],
  dairyDessert: ["Tatlı olarak enerji sağlar; süt ürünleri bir miktar protein ve kalsiyum ekler. Şeker ve yağ içerir.", "Provides energy as a dessert; dairy ingredients add some protein and calcium. Contains sugar and fat.", "Десерт даёт энергию; молочные ингредиенты добавляют немного белка и кальция. Содержит сахар и жиры."],
  dessert: ["Tatlı bir enerji kaynağıdır. Şeker ve yağ miktarı tarife bağlıdır.", "A sweet source of energy. Sugar and fat amounts depend on the recipe.", "Сладкий источник энергии. Количество сахара и жиров зависит от рецепта."],
  almond: ["Badem doymamış yağ ve bir miktar protein sağlar; tatlı ayrıca şeker ve yağ içerir.", "Almonds contribute unsaturated fat and some protein; the dessert also contains sugar and fat.", "Миндаль добавляет ненасыщенные жиры и немного белка; десерт также содержит сахар и жиры."],
  cheese: ["Peynir protein ve kalsiyum, hamur karbonhidrat sağlar; tuz ve yağ tarife bağlıdır.", "Cheese contributes protein and calcium; bread or pastry provides carbohydrates. Salt and fat depend on the recipe.", "Сыр добавляет белок и кальций, выпечка — углеводы. Количество соли и жиров зависит от рецепта."],
  beef: ["Dana eti protein ve demir, ekmek karbonhidrat sağlar; soslar toplamı değiştirir.", "Beef contributes protein and iron; bread provides carbohydrates. Sauces change the total.", "Говядина добавляет белок и железо, хлеб — углеводы. Соусы меняют общую пищевую ценность."],
  bread: ["Başlıca karbonhidrat ve enerji sağlar. Yağ, lif ve tuz miktarı tarife bağlıdır.", "Mainly provides carbohydrates and energy. Fat, fibre and salt depend on the recipe.", "В основном даёт углеводы и энергию. Количество жиров, клетчатки и соли зависит от рецепта."]
};

const vitaminNotes = {
  milk: ["Sütte doğal olarak B2 ve B12 bulunur. Bu porsiyondaki miktarlar hesaplanmadı; bitkisel sütte etiketi kontrol edin.", "Milk naturally contains B2 and B12. Amounts in this portion have not been calculated; check the label for plant milk.", "Молоко естественно содержит B2 и B12. Количество в этой порции не рассчитано; для растительного молока нужен состав с упаковки."],
  almond: ["Badem E vitamini içerir; bu porsiyondaki miktar hesaplanmadı.", "Almonds contain vitamin E; the amount in this portion has not been calculated.", "Миндаль содержит витамин E; количество в этой порции не рассчитано."],
  beef: ["Dana eti B12 içerir; bu porsiyondaki miktar hesaplanmadı.", "Beef contains B12; the amount in this portion has not been calculated.", "Говядина содержит B12; количество в этой порции не рассчитано."],
  dairyDessert: ["Süt ürünleri B2 ve B12 içerir; bitmiş tatlıdaki miktarlar doğrulanmadı.", "Dairy ingredients contain B2 and B12; amounts in the finished dessert are unverified.", "Молочные ингредиенты содержат B2 и B12; количество в готовом десерте не подтверждено."],
  fruit: ["C vitamini ancak kullanılan meyve/suyun içeriğine göre değerlendirilebilir. Şuruptan vitamin varsayılmadı; miktar bilinmiyor.", "Vitamin C depends on the actual fruit or juice used. No vitamins are inferred from syrup; the amount is unknown.", "Витамин C зависит от реальных фруктов или сока в составе. Сиропу витамины не приписываются; количество неизвестно."],
  none: ["Bu porsiyonda anlamlı vitamin miktarı doğrulanmadı.", "A meaningful vitamin amount in this portion has not been verified.", "Значимое количество витаминов в этой порции не подтверждено."],
  unknown: ["Tarif ve tedarikçi bilgisi olmadan vitamin miktarları hesaplanamaz.", "Vitamin amounts cannot be calculated without the recipe and supplier information.", "Без рецептуры и данных поставщика количество витаминов не рассчитано."]
};

export const nutritionCopy = {
  tr: { title: "İçerik, beslenme ve vitaminler", ingredients: "Tipik içerik", menuIngredients: "Menüdeki çay karışımı", benefits: "Beslenme açısından", vitamins: "Vitaminler", portion: "Örnek porsiyon", pair: "Birlikte örnek porsiyonlar", ml: "ml", g: "g", note: "Yaklaşık rehber: kafenin doğrulanmış tarifi veya porsiyon ölçüsü değildir. İçerik, süt, şurup ve porsiyon değiştikçe değerler değişir. Alerjiler için kafeden doğrulama alın.", base: "Şeker, süt ve diğer eklemeler hariç.", variant: "Seçilen lezzet", unspecified: "Lezzete göre değişir", source: "Vitamin kaynakları: NIH ODS", sourceUrl: "https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/" },
  en: { title: "Ingredients, nutrition & vitamins", ingredients: "Typical ingredients", menuIngredients: "Tea blend listed on the menu", benefits: "Nutritional contribution", vitamins: "Vitamins", portion: "Example portion", pair: "Combined example portions", ml: "ml", g: "g", note: "Approximate guide: not the café’s verified recipe or serving size. Ingredients, milk, syrup and portion changes affect values. Confirm allergies with the café.", base: "Excludes added sugar, milk and other extras.", variant: "Selected flavour", unspecified: "Varies with flavour", source: "Vitamin references: NIH ODS", sourceUrl: "https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/" },
  ru: { title: "Состав, польза и витамины", ingredients: "Типовой состав", menuIngredients: "Чайная смесь из меню", benefits: "Пищевая ценность", vitamins: "Витамины", portion: "Пример порции", pair: "Пример порций в паре", ml: "мл", g: "г", note: "Примерный ориентир: рецептура и размер порции кафе не подтверждены. Состав, молоко, сироп и размер порции меняют значения. При аллергии уточните состав в кафе.", base: "Без добавленного сахара, молока и других добавок.", variant: "Выбранный вкус", unspecified: "Зависит от выбранного вкуса", source: "Справка о витаминах: NIH ODS", sourceUrl: "https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/" }
};

function pick(values, language) { return values[["tr", "en", "ru"].indexOf(language)] ?? values[0]; }
const vitaminKind = kind => ({ littleMilk: "milk", sweetMilk: "milk", cheese: "milk", black: "none", tea: "none", bread: "unknown", dessert: "unknown" }[kind] ?? kind);

export function nutritionDetails(product, language = "tr", variant = "") {
  language = Object.hasOwn(nutritionCopy, language) ? language : "tr";
  const copy = nutritionCopy[language];
  const pair = Object.hasOwn(nutritionPairs, product.id) ? nutritionPairs[product.id] : null;
  const keys = pair ?? [product.id];
  if (keys.some(key => !Object.hasOwn(nutritionRecipes, key))) return null;
  const recipes = keys.map(key => nutritionRecipes[key]);
  const kinds = [...new Set(recipes.map(recipe => recipe[0]))];
  const ingredients = recipes.map(([kind, wordsString]) => !wordsString && kind === "tea"
    ? `${product.item.description?.[language] ?? product.item.description?.tr ?? ""}; ${pick(words.water, language)}`
    : wordsString.split(" ").map(key => pick(words[key], language)).join(", ")).join(" + ");
  const selected = product.item.variants?.find(entry => entry.id === variant);
  return {
    calorie: calorieLabel(product.id, language),
    portion: keys.map(key => { const row = nutritionPortions[key]; return `${row[2]} ${copy[row[3]]}`; }).join(" + "),
    ingredients: ingredients + (selected ? ` · ${copy.variant}: ${selected.name[language] ?? selected.name.tr}` : ""),
    ingredientLabel: !pair && product.category.id === "herbal-tea" ? copy.menuIngredients : copy.ingredients,
    benefits: kinds.map(kind => pick(benefits[kind], language)).join(" "),
    vitamins: [...new Set(kinds.map(vitaminKind))].map(kind => pick(vitaminNotes[kind] ?? vitaminNotes.unknown, language)).join(" "),
    baseNote: kinds.every(kind => ["black", "tea"].includes(kind)) ? copy.base : "",
    pair: Boolean(pair)
  };
}

export function renderNutrition(container, product, language, variant = "") {
  const data = nutritionDetails(product, language, variant);
  container.replaceChildren();
  container.hidden = !data;
  if (!data) return;
  const copy = nutritionCopy[language] ?? nutritionCopy.tr;
  container.dataset.nutritionProduct = product.id;
  const node = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value) element.textContent = value;
    return element;
  };
  const badge = node("p", "menu-calories", data.calorie);
  const details = node("details", "menu-nutrition-details");
  details.append(node("summary", "", copy.title));
  const body = node("div", "menu-nutrition-body");
  body.append(node("p", "menu-nutrition-portion", `${data.pair ? copy.pair : copy.portion}: ${data.portion}. ${data.baseNote}`));
  const list = node("dl", "");
  for (const [label, value] of [[data.ingredientLabel, data.ingredients], [copy.benefits, data.benefits], [copy.vitamins, data.vitamins]]) {
    list.append(node("dt", "", label), node("dd", "", value));
  }
  const reference = node("a", "menu-nutrition-source", copy.source);
  reference.href = copy.sourceUrl;
  reference.target = "_blank";
  reference.rel = "noopener noreferrer";
  body.append(list, node("p", "menu-nutrition-note", copy.note), reference);
  details.append(body);
  container.append(badge, details);
}
