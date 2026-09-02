export type MenuLanguage = "tr" | "en" | "ru";
export type MenuLocalizedText = Record<MenuLanguage, string>;
export type PairingAvailability = "available" | "unavailable";
export type PairingSourceStatus = "confirmed" | "provisional";

export interface PairingCommercialStatus {
  availability: PairingAvailability;
  sourceStatus: PairingSourceStatus;
  availabilityReason?: string;
}

export interface MenuItemSource {
  id?: string;
  journeyId?: string;
  pricingMode?: "menu-total" | "approved-offer" | string;
  name: MenuLocalizedText;
  description?: MenuLocalizedText;
  image?: string;
  imageAlt?: MenuLocalizedText;
  price: number;
  availability?: PairingAvailability;
  sourceStatus?: PairingSourceStatus;
  availabilityReason?: string;
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
export const pairingCommercialPolicy: Readonly<Record<string, Readonly<PairingCommercialStatus>>>;
export function isPublicPairingEligible(journeyId: string | undefined): boolean;
export const pairingOfferCatalog: MenuItemSource[];
export const menuCategories: MenuCategorySource[];
