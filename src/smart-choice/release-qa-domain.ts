export type ReleaseLocale = "tr" | "en" | "ru";
export type ReleaseNoticeKind = "offline" | "online" | "fatal";

export interface ReleaseQaCopy {
  offlineTitle: string;
  offlineBody: string;
  onlineTitle: string;
  fatalTitle: string;
  fatalBody: string;
  fallbackMenu: string;
  priceUpdated: string;
  languageSelector: string;
  languageNames: Record<ReleaseLocale, string>;
}

export const RELEASE_QA_COPY: Readonly<Record<ReleaseLocale, ReleaseQaCopy>> = {
  tr: {
    offlineTitle: "Bağlantı yok",
    offlineBody: "Smart Choice çevrimdışı kaldı. Mevcut ekranı inceleyebilir veya tam menüye güvenle dönebilirsiniz.",
    onlineTitle: "Bağlantı yeniden kuruldu",
    fatalTitle: "Smart Choice şu anda tamamlanamadı",
    fatalBody: "Ürün veya fiyat tahmini yapılmadı. Tam menüden güvenle devam edebilirsiniz.",
    fallbackMenu: "Tam menüyü aç",
    priceUpdated: "Fiyat güncellendi",
    languageSelector: "Dil seçici",
    languageNames: { tr: "Türkçe", en: "İngilizce", ru: "Rusça" }
  },
  en: {
    offlineTitle: "You are offline",
    offlineBody: "Smart Choice lost its connection. You can review the current screen or safely return to the full menu.",
    onlineTitle: "Connection restored",
    fatalTitle: "Smart Choice could not finish",
    fatalBody: "No product or price was guessed. You can safely continue in the full menu.",
    fallbackMenu: "Open full menu",
    priceUpdated: "Price updated",
    languageSelector: "Language selector",
    languageNames: { tr: "Turkish", en: "English", ru: "Russian" }
  },
  ru: {
    offlineTitle: "Нет подключения",
    offlineBody: "Smart Choice потерял соединение. Можно проверить текущий экран или безопасно перейти в полное меню.",
    onlineTitle: "Подключение восстановлено",
    fatalTitle: "Smart Choice не смог завершить подбор",
    fatalBody: "Система не стала придумывать товар или цену. Можно безопасно продолжить в полном меню.",
    fallbackMenu: "Открыть полное меню",
    priceUpdated: "Цена обновлена",
    languageSelector: "Выбор языка",
    languageNames: { tr: "Турецкий", en: "Английский", ru: "Русский" }
  }
};

const LOCALE_TAGS: Readonly<Record<ReleaseLocale, string>> = {
  tr: "tr-TR",
  en: "en-US",
  ru: "ru-RU"
};

export function normalizeReleaseLocale(value: unknown): ReleaseLocale {
  return value === "en" || value === "ru" || value === "tr" ? value : "tr";
}

export function formatTryMinor(valueMinor: number, locale: ReleaseLocale): string {
  if (!Number.isInteger(valueMinor) || valueMinor < 0) {
    throw new Error("[SMART-CHOICE-RELEASE] TRY value must be a non-negative integer in minor units");
  }
  return new Intl.NumberFormat(LOCALE_TAGS[locale], {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: valueMinor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: valueMinor % 100 === 0 ? 0 : 2
  }).format(valueMinor / 100);
}

export function validateReleaseLocaleMatrix(
  matrix: Readonly<Record<ReleaseLocale, ReleaseQaCopy>> = RELEASE_QA_COPY
): readonly string[] {
  const errors: string[] = [];
  const locales: readonly ReleaseLocale[] = ["tr", "en", "ru"];
  const referenceKeys = Object.keys(matrix.tr).sort();

  for (const locale of locales) {
    const copy = matrix[locale];
    const keys = Object.keys(copy).sort();
    if (keys.join("|") !== referenceKeys.join("|")) {
      errors.push(`${locale}: locale keys differ from tr`);
    }
    for (const [key, value] of Object.entries(copy)) {
      if (key === "languageNames") continue;
      if (typeof value !== "string" || value.trim().length === 0) {
        errors.push(`${locale}.${key}: empty translation`);
      }
    }
    for (const language of locales) {
      if (!copy.languageNames[language]?.trim()) {
        errors.push(`${locale}.languageNames.${language}: empty translation`);
      }
    }
  }

  return errors;
}

export function releaseNotice(locale: ReleaseLocale, kind: ReleaseNoticeKind): {
  title: string;
  body?: string;
} {
  const copy = RELEASE_QA_COPY[locale];
  if (kind === "online") return { title: copy.onlineTitle };
  if (kind === "offline") return { title: copy.offlineTitle, body: copy.offlineBody };
  return { title: copy.fatalTitle, body: copy.fatalBody };
}
