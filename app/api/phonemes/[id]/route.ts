import { prisma } from "@/lib/prisma";
import {
  ApiError,
  noContent,
  ok,
  parseJsonBody,
  plural,
  withErrorHandling,
} from "@/lib/http";
import { readIdParam, phonemeUpdateSchema } from "@/lib/validation";

type Context = RouteContext<"/api/phonemes/[id]">;

/** GET /api/phonemes/:id — one phoneme, with a count of the words that use it. */
export const GET = withErrorHandling(async (_request: Request, ctx: Context) => {
  const id = await readIdParam(ctx.params);

  const phoneme = await prisma.phoneme.findUnique({
    where: { id },
    include: { _count: { select: { words: true } } },
  });

  if (!phoneme) {
    throw ApiError.notFound(`Phoneme ${id}`);
  }

  return ok(phoneme);
});

/** PATCH /api/phonemes/:id — partial update. */
export const PATCH = withErrorHandling(async (request: Request, ctx: Context) => {
  const id = await readIdParam(ctx.params);
  const data = await parseJsonBody(request, phonemeUpdateSchema);

  // A missing row raises P2025 and a duplicate `ipa` raises P2002; both are mapped
  // to 404 / 409 by withErrorHandling.
  const phoneme = await prisma.phoneme.update({ where: { id }, data });

  return ok(phoneme);
});

/**
 * DELETE /api/phonemes/:id
 *
 * Refused while any word still uses the phoneme. The schema enforces this with
 * onDelete: Restrict, but that surfaces as a generic foreign-key error — checking
 * first lets us say exactly how many words are in the way.
 */
export const DELETE = withErrorHandling(async (_request: Request, ctx: Context) => {
  const id = await readIdParam(ctx.params);

  const phoneme = await prisma.phoneme.findUnique({
    where: { id },
    include: { _count: { select: { words: true, wordLists: true, activities: true } } },
  });

  if (!phoneme) {
    throw ApiError.notFound(`Phoneme ${id}`);
  }

  if (phoneme._count.words > 0) {
    throw ApiError.inUse(
      `Cannot delete ${phoneme.ipa} — it is used by ${plural(phoneme._count.words, "word")}.`,
      { words: phoneme._count.words },
    );
  }

  await prisma.phoneme.delete({ where: { id } });

  return noContent();
});
