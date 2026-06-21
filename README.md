# Roby's Coffee House — Website Demo

A fast, mobile-first multilingual landing page concept for **Roby's Coffee House in Gazipaşa**.

## Live features

- Turkish, English and Russian language switcher
- Responsive mobile and desktop layout
- Coffee, atmosphere and menu sections
- Google Maps and Instagram calls to action
- Accessible navigation and reduced-motion support
- No build step or external JavaScript dependencies

## Run locally

Open `index.html` in a browser, or start a small local server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy

### Vercel

1. Import this GitHub repository into Vercel.
2. Choose **Other** as the framework preset.
3. Leave the build command empty.
4. Set the output directory to `.`.
5. Deploy.

### GitHub Pages

In repository **Settings → Pages**, select **Deploy from a branch**, choose `main` and `/ (root)`.

## Before showing the final version to the owner

Please confirm or replace:

- Opening hours
- Exact street address
- Menu categories and product names
- Official phone or WhatsApp number
- Original high-resolution photographs
- Permission to publish the café's photographs and logo

The current hero image is used only for a private design demonstration and should be replaced with an owner-approved local file before commercial launch.

Suggested file path for the final photo:

```text
assets/robys-hero.webp
```

Then replace the image URL in `index.html` with `/assets/robys-hero.webp`.

## Recommended next version

- Real menu with prices
- WhatsApp quick-contact button
- Review cards based on approved public reviews
- SEO title and description in three languages
- Custom domain
- Simple analytics

---

Concept built as a local-business MVP: one clear page, one strong visual identity and direct actions that bring customers to the café.
