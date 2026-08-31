import { prisma } from "@/lib/prisma";
import { ApiError, noContent, withErrorHandling } from "@/lib/http";
import { readIdParam } from "@/lib/validation";

type Context = RouteContext<"/api/words/[id]">;

/**
 * DELETE /api/words/:id
 *
 * The word's phoneme sequence and any word-list memberships cascade away with it — a
 * teacher removing a word expects it gone from their lists too. An activity survives:
 * it points at a list, not a word, and any Wordle that pinned this word as its target
 * has that pin set to null and falls back to drawing a random one.
 */
export const DELETE = withErrorHandling(async (_request: Request, ctx: Context) => {
  const id = await readIdParam(ctx.params);

  const word = await prisma.word.findUnique({ where: { id }, select: { id: true } });

  if (!word) {
    throw ApiError.notFound(`Word ${id}`);
  }

  await prisma.word.delete({ where: { id } });

  return noContent();
});
