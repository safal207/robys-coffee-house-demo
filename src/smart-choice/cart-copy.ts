import type { SmartChoiceLanguage } from "./catalog.js";

export const CART_COPY = {
  tr: {
    title: "Sipariş taslağınızı tamamlayın",
    lead: "Menü ve Smart Choice ortak sepeti kullanır. Yeni seçim, menüden eklenen ürünleri korur.",
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
    blocked: "Sepet boş veya seçim eklenemiyor. Tam menüde sepeti kontrol edin.",
    payload: "Kararlı sipariş kodu"
  },
  en: {
    title: "Complete your order draft",
    lead: "Menu and Smart Choice share one cart. A new recommendation keeps items added from the menu.",
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
    blocked: "Cart empty or choice unavailable. Check your cart in the full menu.",
    payload: "Stable order code"
  },
  ru: {
    title: "Соберите черновик заказа",
    lead: "Меню и подбор используют одну корзину. Замена рекомендации сохраняет товары из меню.",
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
    blocked: "Корзина пуста или вариант недоступен. Проверьте состав в меню.",
    payload: "Стабильный код заказа"
  }
} satisfies Record<SmartChoiceLanguage, Record<string, string>>;
