---
title: Collection reference
description: Import rules, privacy, Scryfall images, pricing and collection browsing behavior
---

## Collection reference

[Back to the quick start](../README.md)

### Import a collection

1. Select **Import collection** from Collection, or open `/import`.
2. Choose a **Moxfield export**. Review the entry/copy preview and row-specific
   errors. Selecting a file does not change your collection.
3. Confirm **Replace collection with … entries**.

> [!IMPORTANT]
> Confirmation replaces the entire collection snapshot. Imports are not
> synchronization or undo. Invalid input or a browser storage write failure
> leaves your current collection intact.

An **entry** is one CSV record; **copies** are the total Count.
A record with Count 4 means one entry and four copies. Duplicate records and
separate printings are retained.

### Browse your collection

- Search by name, rules, type or set. Use **Filters** for sets, color identity,
  binder, finish, quantity, price, mana value and deck usage.
- Choose a table, gallery or mobile list. Full card images, face switching and
  image retries stay in the gallery; details show holdings, rules and provenance.
- Open **More options** to save filters, export results or change table options.
  Export includes every matching holding, not just the page or selection.
- Commander tools currently use fictional demo decks. Importing a collection
  does not import decks.

Metadata, reference estimates and complete images load automatically for the
current page or selected detail. There is **no image on/off control**.

#### Read the estimates

- The **Priced subtotal** includes loaded quotes, with priced-copy coverage and
  explicit unpriced exclusions.
- The **Collection estimate** covers the entire active collection, independently
  of filters.
- Choose **Update all prices** to check every imported printing, including
  off-page cards.
- Choose **Refresh visible estimates** to recheck the current page or detail
  sooner. No reimport is needed.

> [!NOTE]
> Missing prices mean unknown, not zero. Estimates are USD reference quotes,
> not real-time execution quotes or condition-adjusted prices. Check coverage
> and retrieval times before relying on a subtotal.

### Try the demo or clear saved data

On `/import`, expand **Demo & saved collection**:

- Choose **Try demo** to explore fictional cards and decks without overwriting
  or deleting a saved import. About also links to this option.
- Choose **Exit demo** to return to the loaded import, or to empty if none was
  loaded. Reload also leaves demo mode; the demo preference is not saved.
- Confirm **Clear saved collection** to remove the imported snapshot and return
  to an empty collection, not demo data.

### Privacy and backups

- Your original CSV snapshot stays in this browser's localStorage for this
  origin. Storage is unencrypted and accessible to other users of the browser
  profile and scripts on this origin.
- Scryfall receives public set code, collector number and language identifiers,
  plus network information such as your IP address. These lookups can reveal
  which printings are being checked. Quantities, tags, costs, flags and CSV
  contents are never sent.
- Images contact `cards.scryfall.io` even when metadata is cached locally.
  Empty and demo views make no provider requests.
- Clearing site data removes all local data. **Clear saved collection** removes
  the import but may leave saved filters and public metadata cached.
- An unreadable snapshot or unavailable storage leaves the app empty with a
  recovery message, never a demo fallback. Stored data is not automatically
  deleted, and storage failures are visible.

> [!IMPORTANT]
> Browser storage is not a backup. Keep your original export for reimport.
> The app's export retains import fields and neutralizes spreadsheet formulas,
> but it is not a Moxfield round-trip format.

Privacy, storage and provider limitations also appear beside relevant values
and under **About & data** in the app.

### Technical reference

<details>
<summary>Import validation and retained fields</summary>

#### File validation

The strict parser accepts the standard 13 Moxfield headers and up to
8 MiB / 20,000 rows. It handles quoted commas, escaped quotes, BOM, CRLF and
multiline cells. `Collector Number` is not assumed to be numeric.

Missing, duplicate or extra columns, malformed quoting and invalid values block
the whole import. Rows are never silently discarded or merged.
Errors use physical CSV line numbers.

Blank Foil means nonfoil; `foil` and `etched` stay distinct, and the original
field is retained. All nonempty languages and conditions are preserved, not
restricted to the demo's English/Japanese or NM/LP.

App-authored labels and errors use export/file wording rather than format jargon.
File extensions, MIME types and the private snapshot schema are unchanged.
The normal import flow stays short, with privacy/backup information in About.

#### Retained fields

Tags, alter/proxy flags, tradelist count, last-modified text and purchase price
are retained in details and exports. They are not interpreted as binder
locations, authenticity, deck allocations or trade availability.
Imported locations are **Unassigned (Moxfield)**.

Purchase Price is acquisition cost, **not market value**.
Its currency and per-copy/total basis are not inferred.
Imported prices start `null`, then use only exact-finish Scryfall reference
quotes. No demo decks or synthetic history are attached.

</details>

<details>
<summary>Images, exact matching and network recovery</summary>

#### Automatic requests

Images always load automatically, including restored imports and cached
results. Users cannot disable image loading or display.
`api.scryfall.com` receives printing identifiers, not private collection fields.
Image URLs are returned by Scryfall, not fabricated.

Automatic browsing checks only distinct printings on the current page
(currently eight rows) or selected detail, not the whole collection.
The explicit **Update all prices** action checks all imported printings in
bounded batches.

#### Loading and recovery

- Resolution is sequential, at least 150 ms between requests, with progress,
  a 15-second timeout and recoverable errors.
- Each new page loads its own uncached images automatically. A short loading
  delay is expected. Navigation aborts obsolete work.
- Each completed success is cached immediately. Public metadata is shared
  across duplicate printings.
- Legacy entries and entries at least 24 hours old refresh when opened,
  not on a background timer.
- Use **Retry / resume visible images** to recover from provider errors.
  There is no manual pause/off control.
- Failures are not automatically retried on the same page. Network/server
  errors pause only that page's resolution, not subsequent pages.
- HTTP 429 stops the batch and honors a minimum 30-second cooldown / Retry-After,
  including when changing pages or manually retrying.

#### Exact matching

Responses must match set/collector/language exactly. Unsupported language
mappings, absent exact printings (including catalog gaps for List cards), and
missing/placeholder scans remain unresolved. There is no English or name-based
fallback.

Metadata can be older than the current catalog. Rules are Oracle text, not
necessarily localized. A catalog image does not depict your copy's condition,
alterations or proxy status.

#### Complete card display

Resolved cards use full `normal`/`large`/`png` images at their original aspect
ratio with `object-fit: contain`. They never use `art_crop`, reconstructed
frames, clipped credits, overlays or image filters.

Separate front/back images use returned face mapping; split cards retain the
single complete image. Thumbnails load lazily. Missing/failed images have
explicit states. Artist and provider attribution appear with resolved cards
and their detail source link.

Demo cards have placeholders, not fake official images.
The original atmospheric header remains.

The gallery uses a centered, image-first layout inspired by Moxfield rather than
large boxed tiles. Complete cards are 240px wide on larger screens and adapt to
two columns on phones, with compact pricing/quantity/printing information below.
Face switching and image retries sit outside the gallery's navigation links.

Detail routes are information-only: holdings, finish comparisons, captured
history, rules and provider/artist attribution, without a card image or empty
image column. The full-width workspace, banner, satchel and 42px list thumbnails
remain unchanged.

</details>

<details>
<summary>Pricing rules, full refresh, cache and history</summary>

#### Quote rules and coverage

Scryfall `prices.usd`, `usd_foil`, and `usd_etched` are validated decimal strings,
converted to integer USD cents and mapped strictly to Nonfoil/Foil/Etched.
Missing quotes stay unknown; valid zero stays zero.
No finish, language, printing or acquisition-cost fallback is used.

Invalid pricing produces an explicit unavailable/error state without discarding
usable images. Legitimately unpriced or unresolved printings remain explicitly
excluded from estimates.

Per-copy and quantity-total estimates appear in the default table, gallery,
mobile list and details. Filters/sorts and exports use the same loaded quotes.
Exports include estimate provenance and retrieval time.
Details show the last retrieval time, not provider observation history.

#### Full-collection refresh

**Update all prices** deduplicates set/collector/language identifiers:

- English printings use the documented collection endpoint in batches of at
  most 75 with 500ms POST pacing.
- Other languages use exact-printing GETs, at least 150ms apart.
- Collection response pagination metadata is optional. If supplied, `has_more`
  must be `false`.
- Systemic failures stop the job; partial successes are kept.
  Progress and failures are visible.
- Stopping this job does not disable images or ordinary page loading.

The collection estimate becomes more complete after this update, but missing
quotes remain excluded. The action sends printing identifiers, never quantities,
tags, acquisition costs or original export contents.
No background scheduling or cloud service is added.

#### Captured history

Public catalog metadata, set names/release dates and quote observations persist
in IndexedDB (`bmc-public-pricing`), separate from the private collection snapshot.
Catalog and observation writes are atomic; duplicate captures are idempotent.

History is per exact printing and finish, with 7/30/90-day or all-captures views.
Changes use only actual comparable observations. Missing quotes stay gaps;
zero starting prices cannot produce percentage changes.

Existing valid cached retrievals may seed history; no older prices are invented.
These are captured reference quotes, not trade history or historical portfolio
holdings.

#### Cache and visible refresh

Public metadata and prices share a cache; the private snapshot is never migrated
or deleted. Older image-only caches remain usable while visible printings refresh.
The legacy localStorage cache is a bounded 64-printing compatibility cache;
it cannot overwrite newer IndexedDB quotes.

Storage failures are visible and do not discard the active collection or
successful in-memory price results. Fresh quotes, including missing quotes,
are reused for 24 hours.

**Refresh visible estimates** checks the current page/detail sooner.
Old estimates can remain visible during refresh/failure, with their original
retrieval time and explicit errors.

Each navigation/filter/sort starts one bounded visible scope. Enrichment must
not chase rows removed or reordered by price/metadata filters into a
whole-collection scan. Refresh explicitly checks the newly visible rows.

Requests retain exact-printing validation, a 15s timeout, 429 cooldown and
cancellation. Full-price refresh and page lookups are serialized.

</details>

<details>
<summary>Set controls, browsing behavior and Commander demo</summary>

#### Sets and sorting

**Sets** supports searchable multi-selection with include-any or exclude mode,
combined with color, finish, usage, quantity and price filters.
Sort by set name, naturally ordered collector number (including alphanumeric
numbers), or set release date, with normal multi-sort priorities.
Unknown dates remain unknown and sort last.

**Group gallery by set** keeps sets contiguous before pagination.
Headings show the subset on each page. Public set metadata comes from Scryfall's
set catalog; no dates are inferred from card names.

Set selections are saved with named filters. Legacy saved filters migrate with
all sets selected by default. Sorting/grouping/layout are session presentation.

#### Collection layout

`/` and the previous `/overview` address redirect to `/collection`.
The workspace uses the full available width beside navigation, with 12px outer
gutters (8px on mobile) and no centered maximum-width cap.

A compact, content-sized local-JPEG header spans that width.
It uses the attributed banner with `object-fit: cover`, an upper-middle focal
point, a dark blue/green left-to-right overlay and a bottom-to-top surface fade.
**My collection** and the active source notice stay in the image foreground,
without a detached source strip, separate landing page or promotional content.

The source badge, source disclosure and Details / Exit demo links wrap on small
screens; Import collection remains available. Search and the first collection
entry, or the import-first empty state, remain visible at tested viewport sizes.

The compact estimate and source disclosures stay near the cards.
The default view is alphabetical, with card names, quantities, finishes and
binder locations. Unit/total USD columns and a compact priced subtotal with
coverage are visible by default; extra columns remain optional.

#### Search and filters

Search covers names/rules/types/sets across the active dataset: your imported
rows, or 48 entries only after choosing demo. Unresolved rules/types are unknown.

AND conditions combine multi-set include/exclude choices, binder, finish,
quantity, price ranges, mana value, missing prices and deck usage.
The nested color group supports ANY/ALL and exclusions.

TanStack Table provides deterministic multi-sort, pagination, desktop
columns/density and explicit selection scope. Color identity lives in Filters;
saving, exporting and table options live under More options.
Grid and mobile list alternatives avoid a page-level horizontal table.

#### Export and saved views

Export includes every matching holding in the same sort order, not just the
page or selection. Spreadsheet formula prefixes are neutralized.

**Save filters** stores one named filter set locally, replacing the previous set.
Sorting, set grouping and layout are not saved. Filter/search data is not put
in URLs. Back from details preserves filters, pagination, layout and scroll.

#### Card details

Details show image-free holdings and provenance, exact printing identifiers,
retained import fields, finish comparisons and captured quote history.
Full images, face switching and image retries remain in the gallery.
Imported identity groups use the exact CSV name until an oracle identity model
is added.

#### Commander workspace

The demo includes partial fixture decks, equivalent-printing ownership,
missing-copy estimates with unpriced coverage, reservations and combined
simultaneous-build shortages.

- When all missing copies are unpriced, the estimate shows **Estimate unavailable**.
- When none are needed, it shows **No missing copies**.
- Mixed price coverage shows a priced subtotal with an exclusion warning.

These are not real 100-card decks or EDHREC power/popularity claims.
Imported collections show an honest no-decks-imported state.

#### Source notices

A source label (Sample data / Local collection) stays visible while either
dataset is active: inside the banner on `/collection`, including `/collection/`,
and as a standalone notice on other routes.
The Local collection label is unchanged; renaming is deferred.

Empty startup shows no sample notice or fixture cards, binders, prices or decks.
It offers **Import collection**, not a no-matching-filters message.

</details>
