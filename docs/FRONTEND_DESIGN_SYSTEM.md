# GoBookNow design system

Branch: `feat/frontend-neo-brutalism`. Implementation: `apps/frontend/src/app/globals.css` and `src/components/ui/`.

## Visual direction

Warm, playful discovery; calm, explicit operational and financial states. Cream canvas, ink outlines, geometric ticket motifs and restrained hard shadows create a recognizable identity. Marketing illustrations are original SVGs. Catalog images, prices, categories, reviews and availability come from the API; decorative fallbacks never pretend to be vendor photographs or offers.

| Token | Value | Use |
| --- | --- | --- |
| Canvas / surface / soft | `#fffdf5` / `#ffffff` / `#f2f0e8` | Page, card, quiet region |
| Ink / muted | `#1d1d1d` / `#4c4c43` | Primary and secondary text |
| Sun / lavender | `#ffe16b` / `#cdb7ff` | Primary action and illustration accent |
| Coral / mint / blue | `#ff8274` / `#a1e8c3` / `#6478ff` | Destructive action, success surface, ticket accent |
| Success / warning / danger | `#17633d` / `#7b4c00` / `#a42635` | Semantic foregrounds |
| Focus / information | `#3046c5` / `#3046a3` | Keyboard ring and links |
| Border | Ink, generally 1.5–2px | Controls and cards |
| Hard shadows | 3px, 5px, 8px offsets, no blur | Hierarchy and tactile actions |
| Radius | 10px controls / 16px cards / 13px small-screen cards | Consistent shape |

Do not use light accent colors as small text on white. All status meanings also have text; color is supplementary. Automated axe checks cover the rendered combinations used in the route and state fixtures.

## Typography and assets

Be Vietnam Pro, static weights 400/600/700/800, self-hosted through `@fontsource/be-vietnam-pro@5.3.0`. Only Latin and Vietnamese subsets are imported. Fontsource package metadata and bundled LICENSE were checked: **SIL OFL 1.1**, BeVietnamPro Project, copyright 2021. Keep the bundled license when redistributing the font. There is no Google Fonts runtime request.

FontTools inspection of the package's equivalent WOFF cmap found all **134 Vietnamese characters** in the verification sample at each chosen weight. Browser tests also wait for the actual WOFF2 font, check its family/readiness and capture Vietnamese text. The eight WOFF2 files total **136,252 bytes**, matching the observed browser transfer. Body text uses 15px with generous line height; headings use 800 weight. Monetary formatting retains integer `BigInt` precision and Vietnamese grouping.

Own stroke icons and SVG illustrations avoid an additional icon or animation bundle. API images keep fixed aspect ratios and meaningful surrounding text. Existing remote image loading is preserved; provider image optimization needs a separate measured policy for the actual image corpus.

## Components and behavior

- `Button`: primary, secondary, danger, ghost; disabled/busy state; loading indicator; 44px minimum control height. Press translates the button and reduces its hard shadow; hover is subtle.
- `StatusBadge`: explicit Vietnamese status label with semantic surface.
- `PageHeading`, `EmptyState`, `SkeletonCards`, `ActionFeedback`: consistent hierarchy, recovery actions and live feedback.
- `AccessibleDialog`: Radix focus trap, Escape dismissal, prior-focus restoration, background scroll lock. Outside clicks do not discard a financial form. Busy mutations prevent accidental dismissal. Maximum height uses `100dvh`; the dialog scrolls internally and leaves room for its shadow.
- `SiteShell`: public navigation, mobile menu, skip link and role hints; workspace navigation stays fully visible as a small-screen grid. JWT decoding selects navigation only; backend guards remain the authorization boundary.
- Workspace resource/action helpers share loading/error handling and synchronous double-submit guards. Session changes clear query caches. Recent booking references are scoped to the token subject and contain only validated UUIDs; every visible ticket/status is fetched from the owned backend endpoint.

## Responsive and accessibility rules

Public layouts stack naturally; side summaries become normal-flow cards on phones. Service detail includes a bottom continuation action. Workspace navigation uses 2 columns on phones, 3 on tablets, and a sticky sidebar on desktop. Operational tables become labelled records below 640px; wider tablet tables scroll inside a focusable region. Do not conceal document-level overflow to make tests pass.

Use real labels, fieldsets and legends. Slot radios use one tab stop plus arrow/Home/End navigation. Review ratings retain native radio semantics. A 3px visible focus ring is distinct from decoration. Loading, errors and success use appropriate status/alert semantics. Reduced motion disables animation and transitions without changing meaning or availability.

Verification covers 375×812 and 1440×1000 screenshots, all routes at 768px and 1280px, and important dialogs at 320×640. Automated accessibility results do not replace physical-device or assistive-technology testing; those limits are recorded in the delivery report.

## Reproducing visual QA

Build frontend, start the production server, then run from `apps/frontend`:

```powershell
$env:VISUAL_BASE_URL='http://127.0.0.1:3300'
pnpm exec playwright test --config playwright.visual.config.ts
```

Use `VISUAL_HEADED=1` for an interactive Chromium window. The CI workflow starts its own server through `VISUAL_START_SERVER=1`. Compare committed **synthetic** screenshots under `e2e/visual/baselines`; use `--update-snapshots` only after reviewing intentional changes. Full reports, traces and performance attachments remain ignored test artifacts. Windows CI keeps screenshot rasterization consistent with the reviewed baselines; Linux runs real backend journeys.
