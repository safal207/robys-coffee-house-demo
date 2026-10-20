// The feed is another view of the menu, with the same IDs and prices.
const slug = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function feedProducts(categories) {
  const lanes = categories.map(category => (category.items ?? category.groups?.flatMap(group => group.items) ?? [])
    .map(item => ({ id: `${category.id}:${item.id ?? slug(item.name.en)}`, category, item,
      image: item.image ?? `src/products/menu-v1/${category.id}--${slug(item.name.en)}.webp` })));
  // Mix categories in the all-items feed without inventing popularity or ratings.
  return Array.from({ length: Math.max(0, ...lanes.map(lane => lane.length)) }, (_, index) =>
    lanes.flatMap(lane => lane[index] ? [lane[index]] : [])).flat();
}

const normalize = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/ı/g, "i").trim();

export function filterFeed(products, category, search) {
  const term = normalize(search);
  return products.filter(product => (category === "all" || product.category.id === category)
    && (!term || normalize([...Object.values(product.item.name), ...Object.values(product.item.description ?? {}),
      ...Object.values(product.category.name)].join(" ")).includes(term)));
}

export function quoteFeedOrder(draft, index) {
  const lines = draft?.lines ?? [];
  return { count: lines.reduce((sum, line) => sum + line.quantity, 0),
    total: lines.reduce((sum, line) => sum + (index.get(line.id)?.item.price ?? 0) * line.quantity, 0) };
}
