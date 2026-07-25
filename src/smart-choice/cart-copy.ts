import type { SmartChoiceLanguage } from "./catalog.js";

export const CART_COPY = {
  tr: {
    title: "Sipariş taslağınızı tamamlayın",
    lead: "Değişiklikler yalnızca katalog fiyatlarıyla hesaplanır. Ücretli seçenekler önceden işaretlenmez.",
    contents: "Seçilen içerik",
    noExtra: "Ek ücret yok",
    add: "Ekle",
    remove: "Kaldır",
    bumpTitle: "Küçük bir ekleme ister misiniz?",
    accept: "Evet, ekle",
    decline: "Hayır, teşekkürler",
    declined: "Ek teklif bu oturumda tekrar gösterilmeyecek.",
    total: "Toplam",
    handoff: "WhatsApp'ta taslağı paylaş",
    draftNote: "Bu yalnızca taslaktır; ödeme veya kafe onayı değildir.",
    unavailable: "Bir seçenek artık kullanılamıyor ve güvenle kaldırıldı.",
    blocked: "Gerekli bir ürün kullanılamıyor. Taslak gönderilemez.",
    payload: "Kararlı sipariş kodu"
  },
  en: {
    title: "Complete your order draft",
    lead: "Every change is priced from the catalog. Paid options are never preselected.",
    contents: "Selected contents",
    noExtra: "No extra charge",
    add: "Add",
    remove: "Remove",
    bumpTitle: "Would you like one small add-on?",
    accept: "Yes, add it",
    decline: "No, thanks",
    declined: "This offer will not appear again in this session.",
    total: "Total",
    handoff: "Share draft in WhatsApp",
    draftNote: "This is only a draft, not a payment or café confirmation.",
    unavailable: "An unavailable optional item was removed safely.",
    blocked: "A required item is unavailable. The draft cannot be shared.",
    payload: "Stable order code"
  },
  ru: {
    title: "Соберите черновик заказа",
    lead: "Все изменения рассчитываются только по каталогу. Платные опции заранее не включаются.",
    contents: "Состав заказа",
    noExtra: "Без доплаты",
    add: "Добавить",
    remove: "Убрать",
    bumpTitle: "Добавить небольшое дополнение?",
    accept: "Да, добавить",
    decline: "Нет, спасибо",
    declined: "В этой сессии предложение больше не появится.",
    total: "Итого",
    handoff: "Отправить черновик в WhatsApp",
    draftNote: "Это только черновик, а не оплата и не подтверждение кафе.",
    unavailable: "Недоступная дополнительная позиция безопасно удалена.",
    blocked: "Обязательная позиция недоступна. Черновик нельзя отправить.",
    payload: "Стабильный код заказа"
  }
} satisfies Record<SmartChoiceLanguage, Record<string, string>>;
