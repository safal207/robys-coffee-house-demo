export type MenuLanguage = "tr" | "en" | "ru";
export type MenuLocalizedText = Record<MenuLanguage, string>;

export interface MenuItemSource {
  id?: string;
  journeyId?: string;
  pricingMode?: "menu-total" | "approved-offer" | string;
  name: MenuLocalizedText;
  description?: MenuLocalizedText;
  image?: string;
  imageAlt?: MenuLocalizedText;
  price: number;
}

export interface MenuGroupSource {
  label: MenuLocalizedText;
  items: MenuItemSource[];
}

export interface MenuCategorySource {
  id: string;
  icon: string;
  name: MenuLocalizedText;
  lead?: MenuLocalizedText;
  items?: MenuItemSource[];
  groups?: MenuGroupSource[];
}

export const menuCopy: Record<MenuLanguage, Record<string, string>>;
export const menuCategories: MenuCategorySource[];
