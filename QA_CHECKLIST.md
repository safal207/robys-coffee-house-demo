# Final QA Checklist

## Code-level checks completed

- [x] All external links opened in a new tab receive `noopener noreferrer`
- [x] External gallery images have a local fallback
- [x] Keyboard focus remains inside the open lightbox
- [x] Background content becomes inert while the lightbox is open
- [x] Route, Instagram, gallery, language and section events are instrumented
- [x] Analytics hooks do not send data to an external service by default
- [x] Existing mobile hero positioning remains unchanged
- [x] Reduced-motion support remains available

## Manual device checks before client presentation

- [ ] Android Chrome: 360 × 800
- [ ] Android Chrome: 393 × 873
- [ ] iPhone Safari: 390 × 844
- [ ] Desktop Chrome: 1366 × 768
- [ ] Test TR / EN / RU on every viewport
- [ ] Open and close each gallery image
- [ ] Test keyboard: Tab, Shift+Tab, Escape, arrows
- [ ] Test Route and Instagram links
- [ ] Test with slow network and disabled cache
- [ ] Run Lighthouse for Performance, Accessibility, Best Practices and SEO

## Launch blockers

- Confirm business-owned image rights
- Confirm opening hours and address
- Replace demo domain with the approved domain
- Connect analytics only after owner approval and privacy review
