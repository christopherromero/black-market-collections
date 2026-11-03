# Black Market Collection

An ad-hoc, self-hosted personal MTG collection browser and Commander workspace.

The site opens directly to the collection, not a marketing page or investment
dashboard. It starts **empty, ready to import**, or restores your saved local
Moxfield collection. A fictional demo is explicitly opt-in and temporary.
It supports **local Moxfield exports** plus always-on exact-printing Scryfall images and USD reference estimates. There is no authentication,
backend, upload service, or cloud storage. Use a trusted local browser profile;
never put a private CSV in the repository, public assets, or build output.

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

The browser suite runs at 390, 768, and 1440 pixels, with additional wide-screen checks. It starts its own loopback
development server on port 4173. `npm.cmd run preview` previews a production build.

## Import a collection locally

1. Select **Import collection** from Collection (or open `/import`).
2. Choose a **Moxfield export**. Review the entry/copy preview and any
   row-specific errors. Selecting a file does not change the active collection.
3. Confirm **Replace collection with … entries** to replace the entire snapshot.
   Invalid input or a browser storage write failure leaves the current data intact.
4. Browse the collection. Public metadata, reference estimates and complete card images load
   automatically for the current page or detail. There is no image on/off control.
5. To remove the imported snapshot, expand **Demo & saved collection** and confirm **Clear saved collection** on `/import`.
   This returns to an empty collection, not demo data.

**Entries** count CSV records, not unique card names. **Copies** sum the Count
column: one record with Count 4 is one entry and four copies. Duplicate records
and separate printings are retained.

The normal import flow is deliberately short; privacy/backup information is in
About. App-authored labels and errors use export/file wording rather than format
jargon. File extensions, MIME types and the private snapshot schema are unchanged.

To explore fictional cards and decks, expand **Demo & saved collection** and choose **Try demo** on `/import` (linked
from About). This does not overwrite or delete any saved import. **Exit demo**
returns to the loaded import, or to empty if none was loaded. Reload also leaves
demo mode; there is no persisted demo preference.

The strict parser handles quoted commas, escaped quotes, BOM, CRLF and multiline
cells. It accepts the standard 13 Moxfield headers (including `Collector Number`,
not a numeric-only assumption), up to 8 MiB / 20,000 rows. Missing/duplicate/extra
columns, malformed quoting and invalid values block the whole import; rows are
never silently discarded or merged. Errors use physical CSV line numbers.
Blank Foil means nonfoil; `foil` and `etched` stay distinct, and the original
field is retained. All nonempty languages and conditions are preserved, not
restricted to the demo's English/Japanese or NM/LP.

Tags, alter/proxy flags, tradelist count, last-modified text and purchase price
are retained in details and exports. They are not interpreted as binder locations,
authenticity, deck allocations, or trade availability. Imported locations are
**Unassigned (Moxfield)**. Purchase Price is acquisition cost, **not market
value**; its currency and per-copy/total basis are not inferred. Imported prices
start `null`, then use only exact-finish Scryfall reference quotes. No demo decks or synthetic history are attached.

The original CSV snapshot persists only in this browser's localStorage for this
origin. Storage failures are visible. Storage is unencrypted, accessible to other
users of the browser profile and scripts on this origin, and not a backup.
Keep the original export. An unreadable snapshot or unavailable storage leaves
the app empty with a recovery message, never a demo fallback; stored data is not
automatically deleted. Clearing site data removes all local data; **Clear saved
collection** removes the imported snapshot but may leave saved filters and public
metadata cached. Imports are replacement snapshots, not synchronization or undo.
The app's export includes retained import fields but is not a Moxfield round-trip
format; it neutralizes spreadsheet formulas, so use the original file to reimport.

### Complete images and provenance

Images **always load automatically**, including restored imports and cached
results. Users cannot disable image loading or display. `api.scryfall.com` receives only public set code,
collector number and language identifiers, plus ordinary network information
such as your IP address. Quantities, tags, costs, flags and CSV contents are
never sent. Image URLs are returned by Scryfall, not fabricated. Loading images
contacts `cards.scryfall.io` even when metadata is already cached locally.

Resolution is sequential, at least 150 ms between requests, bounded to all
distinct printings on the current page (currently eight rows) or selected detail,
with progress, a 15-second timeout and recoverable errors.
Every new page starts loading its own uncached images automatically; a short
loading delay is expected. Navigation aborts obsolete work; each completed
success is cached immediately.
There is no manual pause/off control. **Retry / resume visible images** recovers
from provider errors; navigation automatically cancels obsolete work.
Failures are not automatically retried on the same page; network/server errors
pause only that page's resolution, not subsequent pages.
HTTP 429 stops the batch and honors a minimum 30-second cooldown / Retry-After,
including when changing pages or manually retrying. Successful public metadata is shared across duplicate
printings and cached locally; legacy entries and entries at least 24 hours old
refresh when opened, not on a background timer. Empty/demo views make no
provider requests. Automatic browsing does not scan the whole collection.
The explicit **Update all prices** action checks every imported printing,
including off-page cards, in bounded batches.

The response must match set/collector/language exactly. Unsupported language
mappings, absent exact printings (including catalog gaps for List cards), and
missing/placeholder scans remain unresolved; there is no English or name-based
fallback. Metadata can be older than the current catalog. Rules are Oracle text,
not necessarily localized. A catalog image does not depict your copy's condition,
alterations or proxy status.

Resolved cards use full `normal`/`large`/`png` images at their original aspect
ratio with `object-fit: contain`, never `art_crop`, reconstructed frames, clipped
credits, overlays, or image filters. Separate front/back images use returned face
mapping; split cards retain the single complete image. Thumbnails load lazily;
missing/failed images have explicit states. Artist and provider attribution appear
with resolved cards and their detail source link. Demo cards have placeholders,
not fake official images; the original atmospheric header remains.

The gallery uses a centered, image-first layout inspired by Moxfield rather than
large boxed tiles: complete cards are 240px wide on larger screens, adapting to
two columns on phones, with compact pricing/quantity/printing information below.
Face switching and image retries live in the gallery, outside its navigation links.
Detail routes are information-only: holdings, finish comparisons, captured history,
rules and provider/artist attribution, without a card image or empty image column.
The full-width workspace, banner, satchel and 42px list thumbnails remain unchanged.

### Reference pricing and coverage

Scryfall `prices.usd`, `usd_foil`, and `usd_etched` are validated decimal strings,
converted to integer USD cents and mapped strictly to Nonfoil/Foil/Etched.
Missing quotes stay unknown, valid zero stays zero, and no finish, language,
printing or acquisition-cost fallback is used. Invalid pricing produces an
explicit unavailable/error state without discarding usable images.

The visible **Priced subtotal** includes only loaded quotes, with priced-copy
coverage and unpriced exclusions. **Collection estimate** covers the entire active
collection, independently of filters; it becomes more complete after **Update all
prices**. Legitimately unpriced or unresolved printings remain excluded explicitly.
Per-copy and quantity-total estimates appear in the default table, gallery,
mobile list and details. Filters/sorts and exports use the same loaded quotes.
Exports include estimate provenance and retrieval time; details show the last
retrieval time, not provider observation history. These are not real-time
execution quotes or condition-adjusted prices.

**Update all prices** deduplicates set/collector/language identifiers. English
printings use the documented collection endpoint in batches of at most 75 with
500ms POST pacing; other languages use exact-printing GETs, at least 150ms apart.
Collection response pagination metadata is optional; if supplied, `has_more` must be `false`.
Systemic failures stop the job; partial successes are kept. Progress and failures
are visible. Stopping this full-price job does not disable images or ordinary
page loading. The action sends printing identifiers, never quantities, tags,
acquisition costs or original export contents. Those identifiers can reveal which
printings are being looked up. No background scheduling or cloud service is added.

Public catalog metadata, set names/release dates and quote observations persist
in IndexedDB (`bmc-public-pricing`), not the private collection snapshot. Catalog
and observation writes are atomic; duplicate captures are idempotent. History is
per exact printing and finish, with 7/30/90-day or all-captures views and changes
calculated only from actual comparable observations. Missing quotes stay gaps;
zero starting prices cannot produce percentage changes. Existing valid cached
retrievals may seed the history; no older prices are invented. These are captured
reference quotes, not trade history or historical portfolio holdings.

Public metadata and prices share a cache; the private snapshot is never migrated
or deleted. Older image-only caches remain usable while visible printings refresh.
The legacy localStorage cache is a bounded 64-printing compatibility cache; it
cannot overwrite newer IndexedDB quotes. Storage failures are visible and do not
discard the active collection or successful in-memory price results.
Fresh quotes (including missing quotes) are reused for 24 hours.
**Refresh visible estimates** explicitly checks the current page/detail sooner.
No reimport is needed. Old estimates can remain visible during refresh/failure,
with their original retrieval time and explicit errors.

Each user navigation/filter/sort starts one bounded visible scope. Enrichment
must not chase rows removed or reordered by price/metadata filters into a
whole-collection scan. Refresh explicitly checks the newly visible rows.
Requests retain exact-printing validation, a 15s timeout, 429 cooldown and
cancellation. Full-price refresh and page lookups are serialized.

### Set controls

**Sets** supports searchable multi-selection with include-any or exclude mode,
combined with existing color, finish, usage, quantity and price filters. Sort by
set name, naturally ordered collector number (including alphanumeric numbers),
or set release date, with normal multi-sort priorities. Unknown dates remain
unknown and sort last. **Group gallery by set** keeps sets contiguous before
pagination, with headings showing the subset on each page. Public set metadata
comes from Scryfall's set catalog; no dates are inferred from card names.
Set selections are saved with named filters; legacy saved filters migrate with
all sets selected by default. Sorting/grouping/layout are session presentation.

Reviewed on 2026-11-02:
[API use guidelines](https://scryfall.com/docs/api),
[exact-printing endpoint](https://scryfall.com/docs/api/cards/collector),
[images](https://scryfall.com/docs/api/images),
[rate limits](https://scryfall.com/docs/api/rate-limits), and
[Wizards Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy).
Live verification used Scryfall's documented public XLN/96/en example and received
matching metadata plus HTTP 200 `image/jpeg` from its returned full-card URL.
An isolated Chromium check from the local app origin also verified CORS and
decoded the returned image at 488×680. No private collection was sent for either
check or populated into a user browser. Choose your export in the importer.
Automated tests use synthetic
CSVs and mocked provider responses/images, not private holdings or live APIs.
The same documented example was checked for pricing on 2026-11-02: USD 0.25,
foil USD 0.70, etched unavailable. This is a one-time reference response, not a
freshness guarantee or a check of any user's collection.

Black Market Collection is unofficial Fan Content; see the
[Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy) and
the separate asset permission caveats below. Not approved/endorsed by Wizards or Scryfall. Portions of the materials
used are property of Wizards of the Coast. © Wizards of the Coast LLC.

## App icon provenance

The shared desktop/mobile brand mark and browser favicon use
[`public/enchanters-satchel.png`](public/enchanters-satchel.png), served locally at
`/enchanters-satchel.png`; displaying the icon makes no wiki/CDN request.
This is **Enchanter's Satchel** from *Deadlock*, third-party game artwork
© Valve Corporation, not project-owned artwork or Wizards of the Coast art.
Source: [Deadlock Wiki file page and revision history](https://deadlock.wiki/File:Enchanter%27s_Satchel.png)
and its [original PNG](https://cdn.deadlock.wiki/Enchanter%27s_Satchel.png).
Verified on 2026-11-02: HTTP 200 `image/png`, PNG signature and browser decode,
**137×137 pixels**, saved unchanged from the response (no upscaling).
The supplied [thumbnail](https://cdn.deadlock.wiki/thumb/Enchanter%27s_Satchel.png/90px-Enchanter%27s_Satchel.png)
is 90×90. The original is larger, but neither revision listed by the wiki is
256px or larger; the current image API metadata also reports 137×137.

The wiki's CC BY-SA notice explicitly excludes non-text media and game content;
the file page/API provides no asset-specific reuse license. Attribution is not
permission: reuse/redistribution rights remain unconfirmed and should be checked
before public distribution. No Valve or Deadlock Wiki endorsement is implied.
The collection banner and the project's original atmospheric illustrations are
separate from this icon.

## Collection banner provenance

[`public/collection-banner-acr-087.jpg`](public/collection-banner-acr-087.jpg)
is the user-supplied [MTGPics JPEG](https://www.mtgpics.com/pics/art/acr/087.jpg),
served locally at `/collection-banner-acr-087.jpg` with no external banner request.
It depicts **Black Market Connections** (*Assassin's Creed*, ACR #87), illustrated
by **Filipe Pagliuso**, verified against the
[MTGPics card page](https://www.mtgpics.com/card?ref=acr087) and
[exact public Scryfall catalog entry](https://api.scryfall.com/cards/acr/87).
Artwork **© Wizards of the Coast LLC**, as marked on the supplied JPEG.
Verified on 2026-11-02: HTTP 200 `image/jpeg`, JPEG signature and decoded
**1920×1451 pixels**, **746,190 bytes**, saved unchanged (no redraw or upscaling).
SHA-256: `b75c5e14efa0fd77278321e7be83413698b7f6e97efa42aead213220a3bc32a3`.
The original file retains its copyright notice; only the CSS display is cropped.

MTGPics' card-page footer identifies Wizards' copyright and disclaims endorsement,
but supplies no asset-specific reuse license. The retrieved
[Wizards Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy)
requires unofficial attribution, respect for third-party rights, and preservation
of existing legal notices; it is not confirmation of permission for this specific
banner use. This is a user-requested **local preview**, not public redistribution
approval. Reuse/redistribution rights remain unconfirmed and must be checked before
public distribution, including the cropped display of the notice-bearing original.
No artist, MTGPics or Wizards endorsement is implied.

## Working surfaces

- **Collection first:** `/` and the previous `/overview` address redirect to
  `/collection`. The workspace uses the full available width beside navigation,
  with 12px outer gutters (8px on mobile) and no centered maximum-width cap.
  A compact, content-sized local-JPEG header spans that width and uses
  the attributed banner above, full-width `object-fit: cover` with an upper-middle
  focal point, a dark blue/green left-to-right overlay and a bottom-to-top surface fade
  with **My collection** and the active source notice in the image foreground,
  without a detached source strip, separate landing page or promotional content.
  The source badge, source disclosure and Details / Exit demo links wrap on small
  screens; Import collection remains available. Search and the first
  collection entry (or the import-first empty state) remain visible at the tested viewport sizes.
  The compact estimate and source disclosures stay near the cards. The default
  view is alphabetical, with card names, quantities, finishes, and binder
  locations. Unit/total USD columns and a compact priced subtotal with coverage
  are visible by default; extra columns remain optional.
- **Collection browsing:** searches names/rules/types/sets across the active
  dataset (your imported rows, or 48 entries only after choosing demo; unresolved rules/types are unknown).
  AND conditions combine multi-set include/exclude choices, binder, finish, quantity, price ranges, mana value,
  missing prices and deck usage; the nested color group supports ANY/ALL and
  exclusions. TanStack Table provides deterministic multi-sort, pagination,
  desktop columns/density and explicit selection scope. Color identity lives
  in Filters; saving, exporting and table options live under More options.
  Grid and mobile list alternatives avoid a page-level horizontal table.
- **Export and views:** exports every matching holding in the same sort order,
  not just the page or selection. Spreadsheet formula prefixes are neutralized.
  **Save filters** stores one named filter set locally, replacing the previous
  set. Sorting, set grouping and layout are not saved. Filter/search data is not put in URLs.
  Back from details preserves the current filters, pagination, layout and scroll.
- **Card details:** image-free holdings and provenance, exact printing identifiers,
  retained import fields, finish comparisons and captured quote history.
  Full images, face switching and image retries remain in the gallery. Imported identity groups
  use the exact CSV name until an oracle identity model is added.
- **Commander workspace (demo only):** partial fixture decks, equivalent-printing ownership,
  missing-copy estimates with unpriced coverage, reservations and combined
  simultaneous-build shortages. Estimates show **Estimate unavailable** when
  all missing copies are unpriced, **No missing copies** when none are needed,
  and a priced subtotal with an exclusion warning for mixed price coverage.
  These are not real 100-card decks or EDHREC power/popularity claims. Imported
  collections instead show an honest no-decks-imported state.

A source label (Sample data / Local collection) stays visible while either
dataset is active: inside the banner on `/collection` (including `/collection/`),
and as a standalone notice on other routes. “Local collection” is unchanged;
renaming is deferred. Empty startup shows no sample notice or fixture cards, binders,
prices or decks, and offers **Import collection** instead of a no-matching-filters message.
Price, storage and provider limitations are described beside the
relevant values and under **About & data**.

## Data and design boundaries

Demo identities, rules, decks and values are fictional.
All estimates use USD integer cents. Missing prices remain `null`, never
zero. Chart gaps stay gaps; no real market history, purchases or removals
are inferred. Holdings, summaries, exports and composition share the
same active dataset and query semantics. Unknown identity is not colorless;
unknown mana is not zero, and unknown metadata is excluded from corresponding
metadata filters (including color exclusions).

Sultai inspires the dark blue/green palette, not literal U/B/G branding.
The interface prioritizes cards, copies and deck needs over valuations.
General browsing patterns draw inspiration from Archidekt, EDHREC and Moxfield;
no branding from those sites is bundled. Card scans remain external; the separate
collection banner is bundled from MTGPics for local preview, with provenance and
permission caveats above. The app icon has its own separate attribution.
DM Sans and Manrope are bundled locally through Fontsource; system fonts are fallbacks.
Automatic page lookups and user-initiated price/set refreshes request public
catalog data and images. Original exports, quantities, tags and costs stay local.

Native dialogs provide modal focus containment, Escape and focus restoration.
Card-section tabs support arrow/Home/End keys. Controls have visible focus, chart
tables provide nonvisual equivalents, and motion respects reduced-motion settings.
Accessibility and responsiveness have automated checks but are not a formal audit.

## Implementation and next milestones

React, TypeScript, Vite, TanStack Table v8, Apache ECharts and Lucide icons.
Plain CSS custom properties establish the initial theme; Tailwind/shadcn are
deliberately deferred rather than installed without a need in this milestone.
`CollectionProvider` owns the active dataset as well as query/sort/layout state.
`moxfield.ts` validates imports, `storage.ts` handles transactional persistence,
and `scryfall.ts` validates and rate-limits exact-printing catalog responses.
`catalog-services.ts` handles bounded collection-price requests and public set
metadata; `quote-store.ts` stores public catalog data and captured quotes in
IndexedDB. Private import storage remains separate and unchanged.
No dependency was added for parsing or provider access.

Possible future work, **not prerequisites for local imports**:

1. Choose an OIDC provider and approved identity; add server-side sessions and
   authorization for every private route, query, export and job.
2. Add a same-origin Fastify API, SQLite migrations, local NAS volume, and
   workspace/owner isolation. Move full-dataset query semantics server-side.
3. Add deck imports, snapshot differences and undo without silently deleting
   failed/unresolved holdings.
4. Add reviewed bulk catalog support and separately sourced market-price
   observations with provenance, freshness and backups.
5. Add container packaging and verify on the Synology before any deployment.

This milestone does not claim production authentication, cloud backup,
live synchronization, real-time execution pricing or safe public deployment.
