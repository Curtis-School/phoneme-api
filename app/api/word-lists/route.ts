import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { created, ok, parseJsonBody, parseQuery, withErrorHandling } from "@/lib/http";
import { resolveWordIds } from "@/lib/words";
import {
  resolveTargetPhonemeId,
  serializeWordListDetail,
  serializeWordListSummary,
  wordListDetailInclude,
  wordListSummaryInclude,
} from "@/lib/word-lists";
import { wordListCreateSchema, wordListQuerySchema } from "@/lib/validation";

/**
 * GET /api/word-lists
 *
 * Summaries only — name, target sound and counts. Fetch a single list to get its words.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const { search, phoneme } = parseQuery(request, wordListQuerySchema);

  const filters: Prisma.WordListWhereInput[] = [];

  if (search) {
    filters.push({
      OR: [{ name: { contains: search } }, { description: { contains: search } }],
    });
  }

  if (phoneme) {
    filters.push({ targetPhoneme: { ipa: phoneme } });
  }

  const lists = await prisma.wordList.findMany({
    where: filters.length > 0 ? { AND: filters } : undefined,
    include: wordListSummaryInclude,
    orderBy: { name: "asc" },
  });

  return ok(lists.map(serializeWordListSummary));
});

/** POST /api/word-lists — create a list, optionally populated in one call. */
export const POST = withErrorHandling(async (request: Request) => {
  const { name, description, targetPhoneme, words } = await parseJsonBody(
    request,
    wordListCreateSchema,
  );

  // Both lookups happen before the write so an unknown symbol or spelling fails without
  // leaving a half-built list behind.
  const targetPhonemeId = await resolveTargetPhonemeId(targetPhoneme);
  const wordIds = words ? await resolveWordIds(words) : [];

  const list = await prisma.wordList.create({
    data: {
      name,
      description: description ?? null,
      targetPhonemeId,
      items: {
        create: wordIds.map((wordId, position) => ({ wordId, position })),
      },
    },
    include: wordListDetailInclude,
  });

  return created(serializeWordListDetail(list));
});
