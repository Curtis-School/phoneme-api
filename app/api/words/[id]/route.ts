import { prisma } from "@/lib/prisma";
import {
  ApiError,
  noContent,
  ok,
  parseJsonBody,
  withErrorHandling,
} from "@/lib/http";
import { resolvePhonemeIds, serializeWord, wordInclude } from "@/lib/words";
import { idParamSchema, wordUpdateSchema } from "@/lib/validation";

type Context = RouteContext<"/api/words/[id]">;

async function readId(ctx: Context) {
  const { id } = await ctx.params;

  return idParamSchema.parse(id);
}

/** GET /api/words/:id */
export const GET = withErrorHandling(async (_request: Request, ctx: Context) => {
  const id = await readId(ctx);

  const word = await prisma.word.findUnique({ where: { id }, include: wordInclude });

  if (!word) {
    throw ApiError.notFound(`Word ${id}`);
  }

  return ok(serializeWord(word));
});

/**
 * PATCH /api/words/:id
 *
 * Supplying `phonemes` replaces the entire sequence. The old rows are deleted and
 * rewritten inside one transaction because `position` is unique per word — updating in
 * place would collide with the rows still occupying those positions.
 */
export const PATCH = withErrorHandling(async (request: Request, ctx: Context) => {
  const id = await readId(ctx);
  const { english, hint, phonemes } = await parseJsonBody(request, wordUpdateSchema);

  const existing = await prisma.word.findUnique({ where: { id }, select: { id: true } });

  if (!existing) {
    throw ApiError.notFound(`Word ${id}`);
  }

  // Resolved before the transaction opens so an unknown symbol fails without having
  // touched the sequence.
  const phonemeIds = phonemes ? await resolvePhonemeIds(phonemes) : null;

  const word = await prisma.$transaction(async (tx) => {
    if (phonemeIds) {
      await tx.wordPhoneme.deleteMany({ where: { wordId: id } });
      await tx.wordPhoneme.createMany({
        data: phonemeIds.map((phonemeId, position) => ({ wordId: id, phonemeId, position })),
      });
    }

    return tx.word.update({
      where: { id },
      data: {
        ...(english === undefined ? {} : { english }),
        ...(hint === undefined ? {} : { hint: hint ?? null }),
      },
      include: wordInclude,
    });
  });

  return ok(serializeWord(word));
});

/**
 * DELETE /api/words/:id
 *
 * The word's phoneme sequence and any word-list memberships cascade away with it — a
 * teacher removing a word expects it gone from their lists too. Activities are not
 * affected, since they reference lists rather than individual words.
 */
export const DELETE = withErrorHandling(async (_request: Request, ctx: Context) => {
  const id = await readId(ctx);

  const word = await prisma.word.findUnique({ where: { id }, select: { id: true } });

  if (!word) {
    throw ApiError.notFound(`Word ${id}`);
  }

  await prisma.word.delete({ where: { id } });

  return noContent();
});
