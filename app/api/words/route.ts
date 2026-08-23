import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { created, ok, parseJsonBody, withErrorHandling } from "@/lib/http";
import { resolvePhonemeIds, serializeWord, wordInclude } from "@/lib/words";
import { wordCreateSchema, wordsQuerySchema } from "@/lib/validation";

/**
 * GET /api/words
 *
 * Filters: `?search=` (spelling), `?phoneme=` (contains that sound), `?length=`
 * (exact phoneme count). They combine, so `?phoneme=/s/&length=3` is valid.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const { search, phoneme, length } = wordsQuerySchema.parse({
    search: searchParams.get("search") ?? undefined,
    phoneme: searchParams.get("phoneme") ?? undefined,
    length: searchParams.get("length") ?? undefined,
  });

  // Collected as a list rather than merged into one object: several filters constrain the
  // same `phonemes` relation, and merging them would silently overwrite each other.
  const filters: Prisma.WordWhereInput[] = [];

  if (search) {
    filters.push({ english: { contains: search } });
  }

  if (phoneme) {
    filters.push({ phonemes: { some: { phoneme: { ipa: phoneme } } } });
  }

  if (length !== undefined) {
    // Positions are contiguous from zero, so a word of length N has a phoneme at N-1 and
    // nothing at N. Expressing it this way keeps the filter in the database — Prisma
    // cannot filter on a relation count.
    filters.push({ phonemes: { some: { position: length - 1 } } });
    filters.push({ phonemes: { none: { position: length } } });
  }

  const words = await prisma.word.findMany({
    where: filters.length > 0 ? { AND: filters } : undefined,
    include: wordInclude,
    orderBy: { english: "asc" },
  });

  return ok(words.map(serializeWord));
});

/**
 * POST /api/words
 *
 * Takes the phoneme sequence as IPA symbols and resolves them to rows, so callers never
 * deal in database ids. Unknown symbols abort the whole request.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const { english, phonemes } = await parseJsonBody(request, wordCreateSchema);
  const phonemeIds = await resolvePhonemeIds(phonemes);

  const word = await prisma.word.create({
    data: {
      english,
      phonemes: {
        create: phonemeIds.map((phonemeId, position) => ({ phonemeId, position })),
      },
    },
    include: wordInclude,
  });

  return created(serializeWord(word));
});
