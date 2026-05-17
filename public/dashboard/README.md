# Dashboard hero carousel assets

Lives under `public/dashboard/` so Angular serves the files at the URL
`/dashboard/<file>.svg` directly without going through the bundler — bitmap
photo replacements drop in here too without any build-time concern.

Five lightweight SVG illustrations (each under 2 KB) used as backgrounds for
the dashboard hero carousel slides. The aesthetic — soft gradient meshes plus
abstract organic shapes — is the modern SaaS hero pattern (Linear, Vercel,
Stripe, Notion) and intentionally stays away from stock photography so the
tone remains restrained.

Slides referenced by file name in
`src/app/features/dashboard/components/dashboard-hero-carousel.component.ts`:

| File                      | Theme            | Color story                       |
| ------------------------- | ---------------- | --------------------------------- |
| `slide-serenidad.svg`     | Serenidad        | Deep blue → seafoam, water waves  |
| `slide-memoria.svg`       | Memoria          | Plum → lavender, candle glow      |
| `slide-acompanamiento.svg`| Acompañamiento   | Teal → mint, interlocking blobs   |
| `slide-naturaleza.svg`    | Naturaleza       | Forest → sage, stylised leaves    |
| `slide-cielo.svg`         | Cielo            | Twilight → dawn, soft horizon     |

## Swapping in real photos

If you later want to replace these with curated photographs (institutional
shots, the venue, ceremonies — anything appropriate to the funeral home),
drop the new files in this folder and update the `HERO_SLIDES` array in
`dashboard-hero-carousel.component.ts`. The component does not care whether
the URL points to an SVG or a JPEG / WebP — it renders the asset as a
`background-image` on a fixed-aspect-ratio container so the existing layout
still works with bitmap sources.

Recommended for photos:
- Aspect ratio 8:3 (matches the SVG viewBox of 1600×600).
- Compressed WebP at quality ≈ 75 keeps each slide under 80 KB.
- Always pair with a darkening overlay (the component ships a built-in
  gradient overlay so the foreground text stays readable on any background).
