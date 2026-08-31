# phoneme-api

Backend API for **phoneme-wordle** (CSE3CWA Assessment 2), on Next.js 16 Route Handlers.
No UI — every route returns JSON. Runs on **port 3001**; the frontend owns 3000.

## Getting started

```bash
npm install          # postinstall runs `prisma generate`
cp .env.example .env
npm run db:migrate   # creates ./dev.db
npm run db:seed      # loads the phoneme dataset
npm run dev          # http://localhost:3001
```

| Script | Purpose |
| --- | --- |
| `dev` `build` `start` `lint` | Standard Next.js; dev and start bind to 3001. |
| `db:migrate` / `db:deploy` | Create+apply a migration / apply existing ones (Docker, CI). |
| `db:seed` | Load the dataset. Idempotent. |
| `db:reset` | Drop, re-migrate, re-seed. Prompts first. |
| `db:studio` | Browse the database in Prisma Studio. |

Docker: `docker compose up --build` → http://localhost:3001/health. `down -v` discards the database volume.

## Database

SQLite via **Prisma 7**. Phonemes are stored as rows, never as characters: IPA symbols like
`/θ/` and `/eː/` span multiple code points and must not be split by string indexing.

| Model | Purpose |
| --- | --- |
| `Phoneme` | One speech sound — IPA symbol, label, hint, English grapheme. |
| `Word` | An English word and its ordered phoneme sequence. |
| `WordPhoneme` | Ordered join placing phonemes within a word (`position`). |
| `WordList` | A named collection of words, optionally focused on one target phoneme. |
| `WordListItem` | Membership of a word in a list, with the teacher's ordering. |
| `Activity` | A saved Wordle / Word Search configuration and its output settings. |

`prisma/seed.ts` flattens the Assessment 1 dataset into 43 phonemes, 105 words (413 links),
47 word lists (464 items) and 14 starter activities, upserting on `ipa`, `english` and `name`.

Prisma 7 specifics before editing the schema:

- Datasource URL and seed command live in **`prisma.config.ts`**, not `schema.prisma`.
- There is a single `init` migration. The schema was squashed once the shape settled, so
  there is no migration history to replay — `db:reset` rebuilds from scratch.
- `prisma migrate reset` does **not** seed — hence `db:reset` chains `prisma db seed`.
- **No `enum` on SQLite.** `Activity.type`, `.difficulty`, `.symbolDisplay` are `String`
  columns validated in the API layer.
- The client generates into `lib/generated/prisma` (git-ignored). Import `{ prisma }` from
  `@/lib/prisma`; never construct a client.

## Endpoints

`/health` sits at the root (`/` rewrites to it) and returns `{ status, database, uptime,
timestamp }`, or `503` when the database does not answer. `/api/*` is CRUD.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/phonemes` | Full inventory. `?search=` matches ipa, label, english, example. |
| `GET` | `/api/words` | Words with ordered phonemes. `?search=` `?phoneme=/s/` `?length=3`. |
| `POST` | `/api/words` | Create from IPA symbols. `201`. |
| `DELETE` | `/api/words/:id` | `204`. Links and memberships cascade. |
| `GET` | `/api/word-lists` | Summaries with counts. `?search=` `?phoneme=/s/`. |
| `POST` | `/api/word-lists` | Create, optionally populated in the same call. |
| `GET` | `/api/word-lists/:id` | The list with its words in order, each with phonemes. |
| `PATCH` | `/api/word-lists/:id` | Update name, description, target phoneme and/or membership. |
| `DELETE` | `/api/word-lists/:id` | `204`, or `409` while an activity still uses it. |
| `GET` | `/api/activities` | Saved configurations. `?type=` `?difficulty=` `?wordListId=`. |
| `POST` | `/api/activities` | Save a configuration. `201`. |
| `GET` | `/api/activities/:id` | One saved configuration. |
| `PATCH` | `/api/activities/:id` | Edit in place. `type` is immutable. |
| `DELETE` | `/api/activities/:id` | `204`. The word list is untouched. |
| `GET` | `/api/activities/:id/generate` | Resolve a saved activity into a playable config. |

### Words

```jsonc
// POST /api/words — phonemes in and out are IPA symbols, never ids
{ "english": "thumb", "phonemes": ["/θ/", "/ɐ/", "/m/"] }

// response — the join table is flattened away
{ "id": 106, "english": "thumb",
  "phonemes": [{ "id": 12, "ipa": "/θ/", "label": "TH", "example": "as in thin", "english": "th" }] }
```

An unknown symbol rejects the whole request with `400`, naming every offending symbol at
once. Words are immutable once created — delete and re-create instead.

### Word lists

Words are referenced by spelling, the target sound by IPA symbol:
`{ "name": "TH practice", "targetPhoneme": "/θ/", "words": ["thin", "thrust"] }`.

The collection returns summaries only — expanding all 46 seeded lists would mean hundreds of
rows on a request that needs names and counts. `words` in a `PATCH` replaces the whole
membership, which is how add, remove and reorder are all expressed; array order is stored order.

### Activities

The body is discriminated on `type`; both variants also accept optional `symbolDisplay`
(`ipa` | `english`), `showTooltips` and `theme`.

```jsonc
// `wordId` is optional: pin a target so the same puzzle regenerates every time.
{ "type": "wordle", "name": "Week 3", "difficulty": "easy",
  "wordListId": 44, "maxGuesses": 5, "wordLength": 3, "wordId": 25 }

{ "type": "word_search", "name": "TH hunt", "difficulty": "medium",
  "wordListId": 22, "targetPhoneme": "/θ/", "gridSize": 8, "wordCount": 2, "seed": 7 }
```

- Both are `.strict()`: `gridSize` on a Wordle is a `400`, not a dropped field.
- **Names are not unique. Configurations are.** Saving a second activity whose settings
  match one already stored is a `409 CONFLICT` naming the existing one, whatever you call
  it. Both types are checked, on the fields that change the puzzle — for a Wordle that
  includes the pinned `wordId` and the output settings, for a Word Search the `seed` too,
  so a different seed is a different activity rather than a duplicate.
- Responses carry only the settings that apply — a Wordle omits `gridSize` rather than
  returning a meaningless `null`.
- `PATCH` merges any subset except `type` onto the stored row and revalidates the whole,
  so a partial write can't leave a Wordle without its `wordLength`.
- Configurations are checked against their word list on write: a Wordle whose list holds no
  word of the required length, or a Word Search wanting more words than the list has, is `400`.

### Generating an activity

This is the seam between the two projects. `config` matches the frontend's `WordleConfig` /
`WordSearchConfig` exactly — including `Phoneme`, the four content fields with ids and
timestamps projected away — so it feeds the existing builders and exporters unchanged.
`settings` is likewise its `ActivitySettings`.

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

- Read-only; records nothing and can be called repeatedly.
- **Wordle** draws a random word of the activity's `wordLength`, so one activity yields a
  different puzzle each time. `?wordId=` pins the target and the chosen id is echoed back.
- **Word Search** draws `wordCount` words using the stored `seed` and returns the seed used;
  passing it to the frontend's `generateWordSearch` reproduces the activity — the same
  `mulberry32` drives both sides. `?seed=` overrides for one request.
- The inventory for empty grid cells is not included — fetch it from `/api/phonemes`.

A list can be edited after an activity was saved, so this endpoint re-checks what create-time
validation could only promise at the time:

| Situation | Response |
| --- | --- |
| List no longer holds a word of the required length | `409 UNSATISFIABLE` |
| Word Search list is empty | `409 UNSATISFIABLE` |
| List has fewer words than `wordCount` | Clamped; `words.length` shows the shortfall |
| `?wordId=` not in the list, or the wrong length | `400` explaining which |

## Errors

Every failure returns the same envelope, so callers branch on `code` rather than parsing
prose. Handlers are wrapped in `withErrorHandling` (`lib/http.ts`), which maps `ApiError`s,
Zod failures and Prisma error codes onto this table. Unhandled methods return `405`.

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
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | A body or query parameter failed its Zod schema. |
| `400` | `INVALID_JSON` | The body was not parseable JSON. |
| `400` | `INVALID_REFERENCE` | A foreign key pointed at a row that does not exist. |
| `404` | `NOT_FOUND` | The addressed record does not exist. |
| `409` | `CONFLICT` | A unique column already holds that value, or an identical activity is already saved. |
| `409` | `IN_USE` | A delete was refused because dependent rows exist. |
| `409` | `UNSATISFIABLE` | An activity's word list can no longer support it. |
| `500` | `INTERNAL_ERROR` | Anything unhandled. Logged, never returned. |

Schemas live in `lib/validation.ts`. IPA symbols are validated as non-empty trimmed strings,
not by character count — `/eː/` and `/ɑe/` span several code points.

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
  phonemes.ts         # the phoneme shapes every serialiser shares
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
Dockerfile            # two-stage build
docker-compose.yml    # service, port, volume
```

## Notes for this Next.js version

- `middleware.ts` is deprecated in Next.js 16, renamed to `proxy.ts` (root level, exporting
  `proxy`). Use it if we add CORS, auth or rate limiting.
- Dynamic route params use the global `RouteContext<'/api/thing/[id]'>` helper, generated by
  `next dev` / `next build` / `next typegen`. No import needed.
- A `route.ts` may only export HTTP handlers and Next's known config keys — shared helpers
  go in `lib/`.
- Route Handlers are uncached by default; `GET` can opt in with
  `export const dynamic = 'force-static'`.
