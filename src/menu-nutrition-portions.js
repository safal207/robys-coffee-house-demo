// Editorial estimates for the example portions below, not café recipe data.
// This detailed index loads with the product dialog. See docs/menu-nutrition.md for the assumptions.
export const nutritionPortions = {
  "hot-coffee:espresso": [2, 5, 30, "ml"],
  "hot-coffee:americano": [2, 10, 250, "ml"],
  "hot-coffee:espresso-macchiato": [10, 30, 50, "ml"],
  "hot-coffee:cortado": [35, 65, 100, "ml"],
  "hot-coffee:flat-white": [80, 130, 180, "ml"],
  "hot-coffee:cappuccino": [70, 130, 200, "ml"],
  "hot-coffee:caramel-cappuccino": [130, 210, 250, "ml"],
  "hot-coffee:caffe-latte": [120, 180, 300, "ml"],
  "hot-coffee:chocolate-cookie-latte": [180, 300, 300, "ml"],
  "hot-coffee:cinnamon-latte": [120, 230, 300, "ml"],
  "hot-coffee:caramel-latte": [170, 260, 300, "ml"],
  "hot-coffee:vanilla-latte": [170, 260, 300, "ml"],
  "hot-coffee:hazelnut-latte": [170, 260, 300, "ml"],
  "hot-coffee:caffe-mocha": [190, 310, 300, "ml"],
  "hot-coffee:white-chocolate-mocha": [210, 340, 300, "ml"],
  "brew-hot:filter-coffee": [2, 10, 250, "ml"],
  "brew-hot:turkish-coffee": [2, 10, 70, "ml"],
  "brew-hot:black-tea": [0, 5, 200, "ml"],
  "brew-hot:hot-chocolate": [200, 330, 300, "ml"],
  "brew-hot:milk": [120, 160, 250, "ml"],
  "brew-hot:salep": [180, 290, 250, "ml"],
  "brew-hot:chai-tea-latte": [150, 270, 300, "ml"],
  "cold-coffee:iced-filter-coffee": [2, 10, 350, "ml"],
  "cold-coffee:iced-americano": [2, 10, 350, "ml"],
  "cold-coffee:iced-caffe-latte": [90, 160, 350, "ml"],
  "cold-coffee:flavoured-iced-caffe-latte": [140, 270, 350, "ml"],
  "cold-coffee:iced-mocha": [170, 290, 350, "ml"],
  "cold-coffee:white-chocolate-mocha": [190, 320, 350, "ml"],
  "cold-coffee:caffe-latte-frappe": [180, 370, 350, "ml"],
  "cold-coffee:milkshake": [250, 450, 350, "ml"],
  "refreshers:cool-lime": [80, 180, 350, "ml"],
  "refreshers:berry-hibiscus": [80, 180, 350, "ml"],
  "refreshers:mango-passionfruit": [100, 210, 350, "ml"],
  "refreshers:berry-lemonade": [90, 200, 350, "ml"],
  "refreshers:pineapple-berry": [100, 210, 350, "ml"],
  "refreshers:summer-pine": [80, 210, 350, "ml"],
  "refreshers:tropical-mango": [130, 260, 350, "ml"],
  "refreshers:strawberry-lime": [110, 230, 350, "ml"],
  "refreshers:yuzu-popcorn": [130, 270, 350, "ml"],
  "herbal-tea:beauty-tea-floral-white-tea": [0, 5, 250, "ml"],
  "herbal-tea:tahiti-tea-hibiscus-lemongrass": [0, 5, 250, "ml"],
  "herbal-tea:maroc-tea-mint-green-tea": [0, 5, 250, "ml"],
  "herbal-tea:relax-tea-lavender-rooibos": [0, 5, 250, "ml"],
  "herbal-tea:balance-tea-detox-green-tea": [0, 5, 250, "ml"],
  "desserts:san-sebastian-cheesecake": [350, 510, 120, "g"],
  "desserts:lotus-cheesecake": [400, 570, 120, "g"],
  "desserts:raspberry-cheesecake": [330, 490, 120, "g"],
  "desserts:chocolate-cake": [370, 550, 120, "g"],
  "desserts:almond-tart": [350, 500, 100, "g"],
  "desserts:cake-roll": [250, 400, 100, "g"],
  "desserts:mosaic-cake": [350, 500, 100, "g"],
  "desserts:tiramisu": [300, 460, 120, "g"],
  "desserts:brownie": [350, 480, 100, "g"],
  "desserts:savoury-cookie": [200, 290, 50, "g"],
  "desserts:cookie": [220, 320, 60, "g"],
  "desserts:macaron": [70, 110, 20, "g"],
  "food:three-cheese-croissant": [400, 570, 130, "g"],
  "food:nutella-croissant": [400, 560, 120, "g"],
  "food:white-cheese-baguette-sandwich": [400, 620, 220, "g"],
  "food:beef-sirloin-baguette-sandwich": [450, 700, 250, "g"],
  "food:sesame-simit": [300, 420, 100, "g"]
};

export const nutritionPairs = {
  "pairing-offers:cool-lime-macaron-pairing": ["refreshers:cool-lime", "desserts:macaron"],
  "pairing-offers:iced-san-sebastian-pairing": ["cold-coffee:iced-caffe-latte", "desserts:san-sebastian-cheesecake"]
};

export function calorieRange(id) {
  if (Array.isArray(id)) {
    const ranges = id.map(calorieRange);
    return ranges.length && ranges.every(Boolean)
      ? ranges.reduce((sum, range) => sum.map((value, i) => value + range[i]), [0, 0]) : null;
  }
  if (Object.hasOwn(nutritionPortions, id)) return nutritionPortions[id].slice(0, 2);
  const pair = Object.hasOwn(nutritionPairs, id) ? nutritionPairs[id] : null;
  return pair ? pair.reduce((sum, key) => sum.map((value, i) => value + nutritionPortions[key][i]), [0, 0]) : null;
}
