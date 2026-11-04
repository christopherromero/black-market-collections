---
title: Development and attribution
description: Data boundaries, design, tests, architecture, future work and asset permissions
---

## Development and attribution

[Back to the quick start](../README.md)

### Data and design

<details>
<summary>Data boundaries, design and accessibility</summary>

#### Data boundaries

Demo identities, rules, decks and values are fictional.
All estimates use USD integer cents. Missing prices remain `null`, never zero.
Chart gaps stay gaps; no real market history, purchases or removals are inferred.

Holdings, summaries, exports and composition share the same active dataset and
query semantics. Unknown identity is not colorless; unknown mana is not zero.
Unknown metadata is excluded from corresponding metadata filters, including
color exclusions.

#### Design

Sultai inspires the dark blue/green palette, not literal U/B/G branding.
The interface prioritizes cards, copies and deck needs over valuations.
Browsing patterns draw inspiration from Archidekt, EDHREC and Moxfield;
no branding from those sites is bundled.

Card scans remain external. The separate collection banner is bundled from
MTGPics for local preview, with the permission caveats below.
The app icon has its own attribution.
DM Sans and Manrope are bundled locally through Fontsource; system fonts
are fallbacks.

Automatic page lookups and user-initiated price/set refreshes request public
catalog data and images. Original exports, quantities, tags and costs stay local.

#### Accessibility

Native dialogs provide modal focus containment, Escape and focus restoration.
Card-section tabs support arrow/Home/End keys.
Controls have visible focus, chart tables provide nonvisual equivalents,
and motion respects reduced-motion settings.

Accessibility and responsiveness have automated checks, but not a formal audit.

</details>

### Development

<details>
<summary>Tests, implementation and possible future work</summary>

#### Run checks

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

The browser suite runs at 390, 768, and 1440 pixels, with additional wide-screen
checks. It starts its own loopback development server on port 4173.
`npm.cmd run preview` previews a production build.

Automated tests use synthetic CSVs and mocked provider responses/images,
not private holdings or live APIs.

#### Implementation

React, TypeScript, Vite, TanStack Table v8, Apache ECharts and Lucide icons.
Plain CSS custom properties establish the theme.
Tailwind/shadcn are deliberately deferred rather than installed without a need.

- `CollectionProvider` in [state.tsx](../src/state.tsx) owns the active dataset and
  query/sort/layout state.
- [moxfield.ts](../src/moxfield.ts) validates imports.
- [storage.ts](../src/storage.ts) handles transactional private-import persistence.
- [scryfall.ts](../src/scryfall.ts) validates and rate-limits exact-printing responses.
- [catalog-services.ts](../src/catalog-services.ts) handles bounded collection-price
  requests and public set metadata.
- [quote-store.ts](../src/quote-store.ts) stores public catalog data and captured
  quotes in IndexedDB.

Private import storage remains separate and unchanged.
No dependency was added for parsing or provider access.

#### Possible future work

These are **not prerequisites for local imports**:

1. Choose an OIDC provider and approved identity; add server-side sessions and
   authorization for every private route, query, export and job.
2. Add a same-origin Fastify API, SQLite migrations, local NAS volume, and
   workspace/owner isolation. Move full-dataset query semantics server-side.
3. Add deck imports, snapshot differences and undo without silently deleting
   failed/unresolved holdings.
4. Add reviewed bulk catalog support and separately sourced market-price
   observations with provenance, freshness and backups.
5. Add container packaging and verify on the Synology before any deployment.

</details>

### Attribution and permissions

Black Market Collection is unofficial Fan Content; see the
[Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy).
Not approved/endorsed by Wizards or Scryfall.
Portions of the materials used are property of Wizards of the Coast.
© Wizards of the Coast LLC.

> [!CAUTION]
> Attribution is not permission. Reuse/redistribution rights for the bundled
> icon and banner remain unconfirmed. Check them before public distribution.
> The banner is a local preview, not public redistribution approval.

<details>
<summary>Provider verification and asset provenance</summary>

#### Scryfall verification

Reviewed on 2026-11-02:
[API use guidelines](https://scryfall.com/docs/api),
[exact-printing endpoint](https://scryfall.com/docs/api/cards/collector),
[images](https://scryfall.com/docs/api/images),
[rate limits](https://scryfall.com/docs/api/rate-limits), and
[Wizards Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy).

Live verification used Scryfall's documented public XLN/96/en example and
received matching metadata plus HTTP 200 `image/jpeg` from its returned
full-card URL. An isolated Chromium check from the local app origin verified
CORS and decoded the returned image at 488×680.

No private collection was sent for either check or populated into a user browser.
Choose your export in the importer.

The same documented example was checked for pricing on 2026-11-02:
USD 0.25, foil USD 0.70, etched unavailable.
This is a one-time reference response, not a freshness guarantee or a check of
any user's collection.

#### App icon

The shared desktop/mobile brand mark and browser favicon use
[`public/enchanters-satchel.png`](../public/enchanters-satchel.png), served locally at
`/enchanters-satchel.png`. Displaying it makes no wiki/CDN request.
This is **Enchanter's Satchel** from *Deadlock*, third-party game artwork
© Valve Corporation, not project-owned artwork or Wizards of the Coast art.

Source:
[Deadlock Wiki file page and revision history](https://deadlock.wiki/File:Enchanter%27s_Satchel.png)
and its [original PNG](https://cdn.deadlock.wiki/Enchanter%27s_Satchel.png).

Verified on 2026-11-02: HTTP 200 `image/png`, PNG signature and browser decode,
**137×137 pixels**, saved unchanged from the response (no upscaling).
The supplied
[thumbnail](https://cdn.deadlock.wiki/thumb/Enchanter%27s_Satchel.png/90px-Enchanter%27s_Satchel.png)
is 90×90. Neither revision listed by the wiki is 256px or larger;
the current image API metadata also reports 137×137.

The wiki's CC BY-SA notice explicitly excludes non-text media and game content.
The file page/API provides no asset-specific reuse license.
Reuse/redistribution rights remain unconfirmed and should be checked before
public distribution. No Valve or Deadlock Wiki endorsement is implied.
The collection banner and the project's original atmospheric illustrations
are separate from this icon.

#### Collection banner

[`public/collection-banner-acr-087.jpg`](../public/collection-banner-acr-087.jpg)
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
of existing legal notices. It is not confirmation of permission for this banner.

This is a user-requested **local preview**, not public redistribution approval.
Reuse/redistribution rights must be checked before public distribution, including
the cropped display of the notice-bearing original.
No artist, MTGPics or Wizards endorsement is implied.

</details>

This milestone does not claim production authentication, cloud backup,
live synchronization, real-time execution pricing or safe public deployment.
