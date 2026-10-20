# TradeCrafters mark

The active logo is the gold `tC` lettermark used in the app's top-left corner. It retains the sidebar's lowercase letters, overlapping spacing, lowered bold `c` and warm amber color.

- [Square PNG for the GitHub OAuth app avatar](../../apps/web/public/brand/tradecrafters-mark.png)
- [Transparent PNG for other backgrounds](../../apps/web/public/brand/tradecrafters-mark-transparent.png)
- [Editable HTML/CSS export source](sidebar-mark-source.html)

Both PNGs are **1024 × 1024**. Gold is `#EDBC6B`; the avatar background is the sidebar's `#15181A`. The transparent version contains an alpha channel.

These are direct browser renders of the sidebar typography in `apps/web/src/app/layout.tsx` and `.brand-mark` in `globals.css`. The source keeps its font family, weights, letter spacing and vertical offset, then scales and centers the visible glyphs on a square canvas. It uses the same `Inter, "Segoe UI", Arial, sans-serif` font stack; these exports were rendered on Windows with the app's available system fonts. The committed PNGs preserve that appearance across platforms.

To reproduce, serve the export HTML locally and capture its `#avatar` and `#transparent` elements with Playwright at 1024 pixels. Use `omitBackground: true` for the transparent element. The sidebar itself remains the source of the mark's design.
