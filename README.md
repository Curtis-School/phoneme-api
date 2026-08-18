# phoneme-api

Backend API for **phoneme-wordle**, built on Next.js 16 Route Handlers. There is no UI
in this project — every route returns JSON.

## Getting started

```bash
npm install                 # also runs `prisma generate` via postinstall
cp .env.example .env
npm run db:migrate          # applies migrations, creates prisma/dev.db
npm run db:seed             # loads the phoneme dataset
npm run dev                 # http://localhost:3001
```

The API runs on **port 3001** — `phoneme-wordle` (the frontend) owns 3000.

## Development

```bash
npm run dev        # http://localhost:3001
npm run build      # production build
npm start          # serve the production build on 3001
npm run lint

npm run db:migrate # create + apply a migration in development
npm run db:deploy  # apply existing migrations (used in Docker / CI)
npm run db:seed    # load the phoneme dataset (safe to re-run)
npm run db:reset   # drop, re-migrate and re-seed (prompts before destroying data)
npm run db:studio  # browse the database in Prisma Studio
```

## Database

SQLite via **Prisma 7**. The data model treats phonemes as rows rather than characters,
because IPA symbols such as `/θ/` and `/eː/` occupy more than one character space and must
never be split by string indexing.

| Model | Purpose |
| --- | --- |
| `Phoneme` | One speech sound — IPA symbol, display label, hover hint, English grapheme. |
| `Word` | An English word, optionally with a teacher-authored hint. |
| `WordPhoneme` | Ordered join placing phonemes in sequence within a word (`position`). |
| `WordList` | A named collection of words, optionally focused on one target phoneme. |
| `WordListItem` | Membership of a word in a list, with the teacher's ordering. |
| `Activity` | A saved Wordle / Word Search configuration and its output settings. |
| `ActivityExport` | Audit record of a generated HTML activity. |

### Seed data

`prisma/seed-data/phoneme-word-list.json` is the Assessment 1 dataset, copied across
unchanged. It is denormalised — every word inlines its full phoneme objects — so
`prisma/seed.ts` flattens it into the relational model:

| Rows | Source |
| --- | --- |
| 43 phonemes | `phonemeInventory` |
| 105 words / 413 ordered phoneme links | distinct words across both activity types |
| 46 word lists / 461 items | one per phoneme, plus one per Wordle difficulty tier |
| 6 activities | 3 Wordle + 3 Word Search starters |

The seed is idempotent — it upserts on natural keys (`ipa`, `english`, `name`) and rebuilds
ordered child rows, so `npm run db:seed` can be run repeatedly.

Three things to know before editing the schema:

- **The seed command is configured in `prisma.config.ts`** under `migrations.seed`. Prisma 7
  no longer reads the `"prisma": { "seed": ... }` key from `package.json`. Note that
  `prisma migrate reset` does **not** run the seed automatically, which is why `db:reset`
  chains `prisma db seed` explicitly.

- **The datasource URL lives in `prisma.config.ts`, not `schema.prisma`.** Prisma 7 moved
  it out of the schema, so the `datasource` block has no `url` field.
- **Prisma does not support `enum` on SQLite.** `Activity.type`, `Activity.difficulty` and
  `Activity.symbolDisplay` are `String` columns; their allowed values are enforced in the
  API layer, not by the database.

The generated client is written to `lib/generated/prisma` and is **git-ignored** — it is
recreated by `npm install`. Import the shared singleton from `@/lib/prisma`, never
construct a `PrismaClient` directly:

```ts
import { prisma } from "@/lib/prisma";

const phonemes = await prisma.phoneme.findMany();
```

## Endpoints

| Method | Path           | Description                                  |
| ------ | -------------- | -------------------------------------------- |
| `GET`  | `/health`      | Health check — `200` when the database answers, `503` when it does not. |
| `GET`  | `/`            | Rewritten to `/health` (URL unchanged).                                 |

`/health` sits at the root rather than under `/api`, which is reserved for the CRUD
endpoints.

```json
{
  "service": "phoneme-api",
  "timestamp": "2026-08-16T05:23:38.764Z",
  "uptime": 1,
  "status": "ok",
  "database": "connected"
}
```

### Phonemes

| Method   | Path                  | Description                                              |
| -------- | --------------------- | -------------------------------------------------------- |
| `GET`    | `/api/phonemes`       | Full inventory. `?search=` matches ipa, label, english or example. |
| `POST`   | `/api/phonemes`       | Add a phoneme. `201` on success.                          |
| `GET`    | `/api/phonemes/:id`   | One phoneme, including how many words use it.             |
| `PATCH`  | `/api/phonemes/:id`   | Partial update; at least one field required.              |
| `DELETE` | `/api/phonemes/:id`   | `204` on success, `409` while any word still uses it.     |

Endpoints for words, word lists and activities land in following branches.

## Errors

Every failure returns the same envelope, so callers branch on `code` rather than parsing
prose:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body failed validation.",
    "details": [{ "field": "ipa", "code": "too_small", "message": "must not be empty" }]
  }
}
```

| Status | Code                | Raised when                                                    |
| ------ | ------------------- | -------------------------------------------------------------- |
| `400`  | `VALIDATION_ERROR`  | A body or query parameter failed its Zod schema.                |
| `400`  | `INVALID_JSON`      | The request body was not parseable JSON.                        |
| `400`  | `INVALID_REFERENCE` | A foreign key pointed at a row that does not exist.             |
| `404`  | `NOT_FOUND`         | The addressed record does not exist.                            |
| `409`  | `CONFLICT`          | A unique column already holds that value.                       |
| `409`  | `IN_USE`            | A delete was refused because dependent rows exist.              |
| `500`  | `INTERNAL_ERROR`    | Anything unhandled. The detail is logged, never returned.       |

Handlers are wrapped in `withErrorHandling` from `lib/http.ts`, which maps thrown
`ApiError`s, Zod failures and Prisma error codes onto that table. Unhandled HTTP methods
return `405` automatically.

Validation lives in `lib/validation.ts`. Note that IPA symbols are validated as non-empty
trimmed strings rather than by character count — `/eː/` and `/ɑe/` span several code
points, so any single-character rule would reject valid data.

## Structure

```
app/
  health/route.ts     # GET /health
  api/                # CRUD endpoints
lib/
  prisma.ts           # shared PrismaClient singleton
  http.ts             # response envelope + error mapping
  validation.ts       # Zod request schemas
  constants.ts        # allowed values for the String "enum" columns
  generated/prisma/   # generated client (git-ignored)
prisma/
  schema.prisma       # data model
  migrations/         # versioned SQL migrations
  seed.ts             # loads seed-data into the relational model
  seed-data/          # phoneme dataset carried over from Assessment 1
prisma.config.ts      # datasource url, migration paths, seed command (Prisma 7)
next.config.ts        # rewrites / -> /health
```

New endpoints are `route.ts` files under `app/api/`, exporting the HTTP methods they
handle (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`). Unhandled methods
return `405` automatically.

## Notes for this Next.js version

- `middleware.ts` is **deprecated in Next.js 16** and renamed to `proxy.ts` (root level,
  exporting `proxy`). Use that if we add CORS, auth, or rate limiting.
- Dynamic route params are typed with the global `RouteContext<'/api/thing/[id]'>` helper.
  It is generated by `next dev` / `next build` / `next typegen` and needs no import.
- Route Handlers are not cached by default; `GET` can opt in with
  `export const dynamic = 'force-static'`.
