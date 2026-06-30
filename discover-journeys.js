const text = (tr, en, ru) => ({ tr, en, ru });

const allContexts = [
  "morning:hot", "morning:mild", "morning:cool", "morning:rain", "morning:unavailable",
  "day:hot", "day:mild", "day:cool", "day:rain", "day:unavailable",
  "evening:hot", "evening:mild", "evening:cool", "evening:rain", "evening:unavailable",
  "late:hot", "late:mild", "late:cool", "late:rain", "late:unavailable"
];

export const journeys = [
  {
    id: "cool-lime-macaron",
    contexts: allContexts,
    primary: {
      name: "Cool Lime",
      category: "refreshers",
      emoji: "🍹"
    },
    companion: {
      name: "Macaron",
      category: "desserts",
      emoji: "◎"
    },
    title: text(
      "Cool Lime + Makaron",
      "Cool Lime + Macaron",
      "Cool Lime + макарон"
    ),
    reason: text(
      "Canlı lime ferahlığı, küçük ve tatlı makaronla dengelenir. Şimdilik Taste Journey'nin hafif ve parlak seçimi.",
      "Bright lime freshness is balanced by a small sweet macaron. For now, this is Taste Journey's light and vivid choice.",
      "Яркая свежесть лайма уравновешивается маленьким сладким макароном. Пока это лёгкий и яркий выбор Taste Journey."
    )
  },
  {
    id: "iced-san-sebastian",
    contexts: allContexts,
    primary: {
      name: "Iced Caffè Latte",
      category: "cold-coffee",
      image: "src/products/gallery-v5/iced-latte-828.webp",
      emoji: "🧊"
    },
    companion: {
      name: "San Sebastian Cheesecake",
      category: "desserts",
      image: "src/products/gallery-v5/san-sebastian-828.webp",
      emoji: "🍰"
    },
    title: text(
      "Buzlu Latte + San Sebastian",
      "Iced Latte + San Sebastian Cheesecake",
      "Айс-латте + чизкейк Сан-Себастьян"
    ),
    reason: text(
      "Serin kahve ferahlık verir; yoğun ve kremamsı cheesecake tadı yavaşlatır. Şimdilik Taste Journey'nin daha derin seçimi.",
      "The chilled coffee refreshes while the dense, creamy cheesecake slows the moment down. For now, this is Taste Journey's richer choice.",
      "Холодный кофе освежает, а плотный сливочный чизкейк замедляет момент. Пока это более насыщенный выбор Taste Journey."
    )
  }
];

export const imageAlt = {
  "Iced Caffè Latte": text("Roby's buzlu latte", "Roby's iced latte", "Айс-латте Roby's"),
  "San Sebastian Cheesecake": text(
    "San Sebastian cheesecake",
    "San Sebastian cheesecake",
    "Чизкейк Сан-Себастьян"
  )
};
