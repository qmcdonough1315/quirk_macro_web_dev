# Implement the new Quirk Macro favicon

## Goal
Replace the current playful multi-color SVG favicon with the selected "Geometric Prism" direction: a refined, institutional-but-friendly "Q" mark that matches the site's light whimsical-but-serious palette and remains legible at 16px.

## What will change

1. **Create `public/favicon.svg`**
   - Rounded-square container in deep violet (`#2D1B33`, mapped from the site's violet accent).
   - Geometric "Q" made of a coral ring (`#FF5C5C`) plus a gold data-bar tail (`#F59E0B`) at a 45° angle.
   - Subtle inner highlight for depth.
   - Transparent background so browser tabs and Google search results render it cleanly.
   - ViewBox and geometry optimized for crisp scaling at 16×16, 32×32, and 180×180.

2. **Update `src/routes/__root.tsx`**
   - Keep the existing `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` entry (already in place), confirming it points at the new asset.

3. **Remove stale fallback**
   - Delete `public/favicon.ico` so no outdated icon is served to crawlers or clients that ignore the `<link>` tag.

## Verification
- Open the preview and confirm the new favicon appears in the browser tab.
- Check that the header logo area still renders correctly (the favicon change does not touch the in-app logo component).
- Confirm the build passes with no typecheck errors.
