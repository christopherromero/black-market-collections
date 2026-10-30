# Black Market Collection

**Know what you hold.** A personal MTG collection and Commander intelligence app.

This first milestone is a working, responsive **synthetic-data UI**, not a
production collection service. There is no authentication, backend, database,
real collection upload, live provider connection, or deployment yet. All demo
routes are public. Do not put private collection data into this build.

## Run locally

Node.js 22.12+ (or a newer supported release) and npm are required.

```powershell
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1
```

Open the loopback address printed by Vite. The development server is not exposed
to the LAN by default.

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

The browser suite runs at 390, 768, and 1440 pixels. It starts its own loopback
development server on port 4173. `npm.cmd run preview` previews a production build.

## Working surfaces

- **Public landing:** art-led Sultai styling, original SVG illustrations, and
  three curated fictional Commander showcases. On each document load, the next
  showcase differs from the previous one in that tab. This never changes saved
  holdings. Browser storage failures are reported; rotation may then repeat.
- **Overview:** derived counts, valuation coverage, partitioned composition,
  synthetic trend observations with gaps and accessible data tables, and deck
  progress linked to the explorer.
- **Collection:** searches names/rules/types across all 48 synthetic holding rows.
  AND conditions combine binder, finish, quantity, price ranges, mana value,
  missing prices and deck usage; the nested color group supports ANY/ALL and
  exclusions. TanStack Table provides deterministic multi-sort, pagination,
  desktop columns/density and explicit selection scope. Grid and mobile list
  alternatives avoid a page-level horizontal table.
- **Export and views:** exports every matching holding in the same sort order,
  not just the page or selection. Spreadsheet formula prefixes are neutralized.
  One named view can be saved locally. View/search data is not put in URLs.
  Back from details preserves the current filters, pagination, layout and scroll.
- **Card details:** exact printing identifiers, binder holdings, allocations,
  deck usage, separate printing/finish prices, fictional rules/provenance, and
  face switching for the synthetic double-faced card.
- **Commander workspace:** partial fixture decks, equivalent-printing ownership,
  missing-copy estimates with unpriced coverage, reservations and combined
  simultaneous-build shortages. These are not real 100-card decks or EDHREC
  power/popularity claims.

## Data and design boundaries

All card identities, rules, decks, values, and illustrations are fictional.
Synthetic estimates are USD integer cents. Missing prices remain `null`, never
zero. Chart gaps stay gaps; no real market history, purchases, removals or live
refresh are inferred. Holdings, summaries, exports and composition share the
same fixture dataset and query semantics.

The Sultai black/blue/green palette uses restrained treasure-gold highlights.
General browsing patterns draw inspiration from Archidekt, EDHREC and Moxfield;
no site branding or artwork is bundled. MTGPics artwork must not be added until
usage permission, retrieval terms, provenance and artist credits are verified.
DM Sans and Manrope are bundled locally through Fontsource; system fonts are fallbacks.
No card data leaves the browser. Card/deck data providers are not contacted.

Native dialogs provide modal focus containment, Escape and focus restoration.
Card-section tabs support arrow/Home/End keys. Controls have visible focus, chart
tables provide nonvisual equivalents, and motion respects reduced-motion settings.
Accessibility and responsiveness have automated checks but are not a formal audit.

## Implementation and next milestones

React, TypeScript, Vite, TanStack Table v8, Apache ECharts and Lucide icons.
Plain CSS custom properties establish the initial theme; Tailwind/shadcn are
deliberately deferred rather than installed without a need in this milestone.
The existing offline collection importer remains separate and unchanged.

Before accepting real collection data:

1. Choose an OIDC provider and approved identity; add server-side sessions and
   authorization for every private route, query, export and job.
2. Add a same-origin Fastify API, SQLite migrations, local NAS volume, and
   workspace/owner isolation. Move full-dataset query semantics server-side.
3. Validate representative Moxfield and Archidekt exports privately; stage
   scoped snapshot differences and require explicit publish. Preserve failed
   and unresolved rows without silently deleting existing holdings.
4. Add permitted Scryfall catalog/price enrichment, observation provenance,
   missing/stale/failed-job states, bounded work and backups.
5. Add container packaging and verify on the Synology before any deployment.

This milestone does not claim production authentication, import validation,
live synchronization, real price freshness or safe public deployment.
