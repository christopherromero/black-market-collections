---
title: Black Market Collection
description: Local MTG collection browsing with Moxfield imports
---

## Black Market Collection

A local MTG collection browser and optional fictional Commander demo.
Import a Moxfield export; browse automatic Scryfall images and USD reference
estimates. Starts empty or restores your saved collection.

### Run locally

You need Node.js 22.12+ (or a newer supported release) and npm.

```powershell
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1
```

Open the loopback address printed by Vite. The development server is not exposed
to the LAN by default.

### Import a collection

1. Open **Import collection**, or go to `/import`.
2. Choose a **Moxfield export** and review the preview and row-specific errors.
3. Confirm **Replace collection with … entries**.

> [!IMPORTANT]
> Confirmation replaces the entire snapshot, with no synchronization or undo.
> Invalid input or a failed storage write leaves the current collection intact.

Choose **Try demo** under **Demo & saved collection** for temporary fictional
data; your saved import stays intact. **Clear saved collection** removes the
import and returns to empty.

### Privacy and prices

- Browser storage is local, unencrypted and **not a backup**.
  Keep your original export for reimport; the app's export is not a round-trip.
- Scryfall receives public printing identifiers and network information
  (including your IP), not CSV contents, quantities, tags, costs or flags.
- Images always load. Missing prices are excluded, not treated as zero.
- Choose **Update all prices** to check all imported printings.
  Quotes are USD reference estimates, not live or condition-adjusted prices.

> [!CAUTION]
> There is no authentication, backend, upload service or cloud storage.
> Use a trusted browser profile. Keep private CSVs out of the repository,
> public assets and build output.

### More detail

- [Collection reference](docs/collection-reference.md): importing, privacy,
  images, pricing, filters and demo behavior
- [Development and attribution](docs/development.md): tests, architecture,
  design, future work and asset permissions

Unofficial Fan Content. Not endorsed by Wizards or Scryfall. Portions of the
materials used are property of Wizards of the Coast. © Wizards of the Coast LLC.
See the [Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy)
and [asset permissions](docs/development.md#attribution-and-permissions)
before public distribution; bundled artwork reuse rights remain unconfirmed.
