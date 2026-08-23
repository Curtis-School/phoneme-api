# phoneme-api

Backend API for **phoneme-wordle** (CSE3CWA Assessment 2), built on Next.js 16 Route
Handlers. There is no UI — every route returns JSON. Runs on **port 3001**; the frontend
owns 3000.

## Getting started

```bash
npm install          # postinstall runs `prisma generate`
cp .env.example .env
npm run db:migrate   # creates prisma/dev.db
npm run db:seed      # loads the phoneme dataset
npm run dev          # http://localhost:3001
```

| Script | Purpose |
| --- | --- |
| `dev` `build` `start` `lint` | Standard Next.js; dev and start bind to 3001. |
| `db:migrate` | Create and apply a migration in development. |
| `db:deploy` | Apply existing migrations (Docker / CI). |
| `db:seed` | Load the dataset. Safe to re-run. |
| `db:reset` | Drop, re-migrate and re-seed. Prompts before destroying data. |
| `db:studio` | Browse the database in Prisma Studio. |

## Database

SQLite via **Prisma 7**. Phonemes are stored as rows, never as characters: IPA symbols such
as `/θ/` and `/eː/` span more than one code point and must not be split by string indexing.

| Model | Purpose |
| --- | --- |
| `Phoneme` | One speech sound — IPA symbol, display label, hover hint, English grapheme. |
| `Word` | An English word, optionally with a teacher-authored hint. |
| `WordPhoneme` | Ordered join placing phonemes in sequence within a word (`position`). |
| `WordList` | A named collection of words, optionally focused on one target phoneme. |
| `WordListItem` | Membership of a word in a list, with the teacher's ordering. |
| `Activity` | A saved Wordle / Word Search configuration and its output settings. |

`prisma/seed-data/phoneme-word-list.json` is the Assessment 1 dataset, carried over
unchanged. `prisma/seed.ts` flattens it into 43 phonemes, 105 words (413 ordered phoneme
links), 46 word lists (461 items) and 6 starter activities. It is idempotent — it upserts
on the natural keys `ipa`, `english` and `name`, and rebuilds ordered child rows.

**Prisma 7 specifics worth knowing before editing the schema:**

- The **datasource URL and seed command live in `prisma.config.ts`**, not in
  `schema.prisma` or the `package.json` `"prisma"` key.
- `prisma migrate reset` does **not** run the seed, which is why `db:reset` chains
  `prisma db seed` explicitly.
- Prisma supports **no `enum` on SQLite**. `Activity.type`, `.difficulty` and
  `.symbolDisplay` are `String` columns whose allowed values are enforced in the API layer.
- The generated client is written to `lib/generated/prisma` and is git-ignored — `npm
  install` recreates it. Import `{ prisma }` from `@/lib/prisma`; never construct a client.

## Endpoints

`/health` sits at the root; `/api/*` is reserved for CRUD.

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/health` | `200` with `{ status, database, uptime, timestamp }` when the database answers; `503` when it does not. |
| `GET` | `/` | Rewritten to `/health`. |

### Phonemes

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/phonemes` | Full inventory. `?search=` matches ipa, label, english or example. |
| `POST` | `/api/phonemes` | Add a phoneme. `201`. |
| `GET` | `/api/phonemes/:id` | One phoneme, with a count of the words using it. |
| `PATCH` | `/api/phonemes/:id` | Partial update; at least one field required. |
| `DELETE` | `/api/phonemes/:id` | `204`, or `409` while any word still uses it. |

### Words

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/words` | Words with their ordered phonemes. `?search=` `?phoneme=/s/` `?length=3` combine. |
| `POST` | `/api/words` | Create a word from IPA symbols. `201`. |
| `GET` | `/api/words/:id` | One word. |
| `PATCH` | `/api/words/:id` | Update `english`, `hint`, and/or replace the phoneme sequence. |
| `DELETE` | `/api/words/:id` | `204`. Phoneme links and list memberships cascade away. |

```jsonc
// POST /api/words — phonemes in and out are IPA symbols, never ids
{ "english": "thumb", "hint": "on your hand", "phonemes": ["/θ/", "/ɐ/", "/m/"] }

// response — the join table is flattened away
{ "id": 106, "english": "thumb", "hint": "on your hand",
  "phonemes": [{ "id": 12, "ipa": "/θ/", "label": "TH", "example": "as in thin", "english": "th" }] }
```

- An unknown symbol rejects the whole request with `400`, naming every offending symbol at
  once rather than failing on the first.
- `phonemes` in a `PATCH` replaces the entire sequence. Positions are contiguous and unique
  per word, so rows are deleted and rewritten in one transaction; a failure part-way (a
  duplicate `english`, say) rolls the sequence back untouched.

### Word lists

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/word-lists` | Summaries with counts. `?search=` `?phoneme=/s/`. |
| `POST` | `/api/word-lists` | Create a list, optionally populated in the same call. |
| `GET` | `/api/word-lists/:id` | The list with its words in order, each with its phonemes. |
| `PATCH` | `/api/word-lists/:id` | Update name, description, target phoneme and/or membership. |
| `DELETE` | `/api/word-lists/:id` | `204`, or `409` while an activity still uses it. |

Words are referenced by spelling and the target sound by IPA symbol —
`{ "name": "TH practice", "targetPhoneme": "/θ/", "words": ["thin", "thrust"] }`.

- The collection returns summaries only. Loading every word for all 46 seeded lists would
  mean several hundred rows plus phoneme sequences on a request that needs names and counts.
- `words` in a `PATCH` replaces the whole membership, which is how adding, removing and
  reordering are all expressed. The array order *is* the stored order.

### Activities

A saved Wordle or Word Search configuration. Many may point at the same word list.

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/activities` | Saved configurations. `?type=` `?difficulty=` `?wordListId=`. |
| `POST` | `/api/activities` | Save a new configuration. `201`. |
| `GET` | `/api/activities/:id` | One activity. |
| `PATCH` | `/api/activities/:id` | Partial update, re-validated as a whole. |
| `DELETE` | `/api/activities/:id` | `204`. The word list it points at is untouched. |

The body is discriminated on `type`, because the two activities need different settings.
Both accept optional `symbolDisplay` (`ipa` | `english`), `showTooltips` and `theme`.

```jsonc
{ "type": "wordle", "name": "Week 3", "difficulty": "easy",
  "wordListId": 44, "maxGuesses": 5, "wordLength": 3 }

{ "type": "word_search", "name": "TH hunt", "difficulty": "medium",
  "wordListId": 22, "targetPhoneme": "/θ/", "gridSize": 8, "wordCount": 2, "seed": 7 }
```

- Both variants are `.strict()`: `gridSize` on a Wordle is a `400`, not a dropped field.
- Responses carry only the settings that apply to that type. One row holds the columns for
  both, but a Wordle response omits `gridSize` rather than returning a meaningless `null`.
- `type` is not patchable — delete and recreate instead. A `PATCH` is merged onto the
  stored row and re-validated against the create schema, so updates face the same rules as
  creates.
- The configuration is checked against its word list on write: a Wordle whose list holds no
  word of the required length, or a Word Search asking for more words than the list
  contains, is rejected with an explanatory `400`.

### Generating an activity

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/activities/:id/generate` | Resolve a saved activity into a playable config. |

This is the seam between the two projects. `config` matches the frontend's `WordleConfig`
and `WordSearchConfig` exactly — including `Phoneme`, which is the four content fields only,
with ids and timestamps projected away — so it can be handed to the existing builder
components and HTML exporters unchanged. `settings` is likewise its `ActivitySettings`.

```jsonc
// GET /api/activities/1/generate
{
  "activity": { "id": 1, "name": "easy Wordle", "type": "wordle", "difficulty": "easy",
                "wordList": { "id": 44, "name": "easy Wordle words" } },
  "settings": { "theme": "light", "symbolDisplay": "ipa", "showTooltips": true },
  "config":   { "englishWord": "boil", "word": [ /* Phoneme */ ], "maxGuesses": 5,
                "difficulty": "easy" },
  "wordId":   25
}
```

- Read-only; it records nothing and can be called repeatedly.
- **Wordle** draws a random word of the activity's `wordLength`, so one saved activity
  yields a different puzzle each time. `?wordId=` pins a target and the chosen id is echoed
  back, letting the same puzzle be requested again.
- **Word Search** draws `wordCount` words using the stored `seed` and returns the seed used.
  Passing it to the frontend's `generateWordSearch` reproduces the whole activity — the same
  `mulberry32` algorithm drives both sides. `?seed=` overrides for one request; an activity
  with no stored seed gets a fresh one.
- The inventory used to fill empty grid cells is not included — fetch it from `/api/phonemes`.

Because a list can be edited after an activity was saved, this endpoint re-checks what
create-time validation could only promise at the time:

| Situation | Response |
| --- | --- |
| List no longer holds a word of the required length | `409 UNSATISFIABLE` |
| Word Search list is empty | `409 UNSATISFIABLE` |
| List has fewer words than `wordCount` | Clamped; `words.length` shows the shortfall |
| `?wordId=` not in the list, or the wrong length | `400` explaining which |

## Errors

Every failure returns the same envelope, so callers branch on `code` rather than parsing
prose. Handlers are wrapped in `withErrorHandling` (`lib/http.ts`), which maps thrown
`ApiError`s, Zod failures and Prisma error codes onto this table. Unhandled HTTP methods
return `405` automatically.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body failed validation.",
    "details": [{ "field": "ipa", "code": "too_small", "message": "must not be empty" }]
  }
}
```

| Status | Code | Raised when |
| ------ | ---- | ----------- |
| `400` | `VALIDATION_ERROR` | A body or query parameter failed its Zod schema. |
| `400` | `INVALID_JSON` | The request body was not parseable JSON. |
| `400` | `INVALID_REFERENCE` | A foreign key pointed at a row that does not exist. |
| `404` | `NOT_FOUND` | The addressed record does not exist. |
| `409` | `CONFLICT` | A unique column already holds that value. |
| `409` | `IN_USE` | A delete was refused because dependent rows exist. |
| `409` | `UNSATISFIABLE` | An activity's word list can no longer support it. |
| `500` | `INTERNAL_ERROR` | Anything unhandled. The detail is logged, never returned. |

Validation lives in `lib/validation.ts`. IPA symbols are validated as non-empty trimmed
strings rather than by character count — `/eː/` and `/ɑe/` span several code points, so any
single-character rule would reject valid data.

## Structure

```
app/
  health/route.ts     # GET /health
  api/                # CRUD endpoints, one route.ts per resource
lib/
  prisma.ts           # shared PrismaClient singleton
  http.ts             # response envelope + error mapping
  validation.ts       # Zod request schemas
  constants.ts        # allowed values for the String "enum" columns
  words.ts            # word serialisation + IPA/spelling resolution
  word-lists.ts       # word-list serialisation + target phoneme resolution
  activities.ts       # activity serialisation + satisfiability checks
  generate.ts         # activity -> frontend config shapes
  generated/prisma/   # generated client (git-ignored)
prisma/
  schema.prisma       # data model
  migrations/         # versioned SQL migrations
  seed.ts             # loads seed-data into the relational model
  seed-data/          # phoneme dataset carried over from Assessment 1
prisma.config.ts      # datasource url, migration paths, seed command
next.config.ts        # rewrites / -> /health
```

## Notes for this Next.js version

- `middleware.ts` is deprecated in Next.js 16 and renamed to `proxy.ts` (root level,
  exporting `proxy`). Use it if we add CORS, auth or rate limiting.
- Dynamic route params are typed with the global `RouteContext<'/api/thing/[id]'>` helper,
  generated by `next dev` / `next build` / `next typegen`. No import needed.
- A `route.ts` may only export HTTP handlers and Next's known config keys — put shared
  helpers in `lib/`.
- Route Handlers are uncached by default; `GET` can opt in with
  `export const dynamic = 'force-static'`.
