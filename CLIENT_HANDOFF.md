# Roby's Coffee House — Client Handoff

Demo: https://safal207.github.io/robys-coffee-house-demo/

## İşletme sahibine kısa özet

Bu site Roby's Coffee House için hazırlanmış çok dilli bir demo çalışmasıdır.

Dahil olanlar:
- Türkçe, İngilizce ve Rusça içerik
- Mobil uyumlu tasarım
- Google Maps rota bağlantıları
- Instagram bağlantıları
- Fotoğraf galerisi ve tam ekran görüntüleme
- Temel yerel işletme SEO verileri
- Erişilebilirlik ve bozuk görsel koruması
- Analitik sistemlere bağlanmaya hazır etkinlikler

## Yayına almadan önce işletme sahibinden onay alınması gerekenler

1. Adres ve çalışma saatleri
2. Menü içerikleri ve fiyatlar
3. Fotoğraf kullanım izinleri
4. Logo ve kurumsal renkler
5. Instagram hesabı ve Google Maps bağlantısı
6. Alan adı seçimi

## Fotoğraflar

Demo içinde açık web kaynaklarından gelen bazı görseller kullanılmaktadır. Canlı yayından önce işletmenin kendi fotoğraflarıyla değiştirilmesi veya yazılı kullanım onayı alınması önerilir.

## Analytics

Site şu olayları üretir:
- `route_click`
- `instagram_click`
- `gallery_open`
- `language_select`
- `section_view`
- `image_fallback`

Olaylar şu anda dışarıya gönderilmez. Tarayıcıdaki `window.dataLayer` ve `window.robysAnalytics.events()` üzerinden test edilebilir. Gerçek raporlama için işletme onayıyla GA4 veya Plausible bağlanmalıdır.

## Rusское резюме

Перед публикацией нужно подтвердить у владельца адрес, часы работы, права на фотографии, меню и ссылки. События аналитики уже подготовлены, но данные никуда не отправляются, пока отдельно не подключён сервис аналитики.

## Basit bakım

- Metinler: `src/i18n.js`
- Ana sayfa yapısı: `index.html`
- Mobil düzen: `mobile.css`
- Premium efektler: `styles.css`
- Conversion bileşenleri: `conversion.css`, `conversion.js`
- QA ve event hooks: `final-qa.css`, `qa.js`, `analytics.js`
