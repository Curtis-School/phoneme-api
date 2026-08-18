import { prisma } from "@/lib/prisma";
import {
  ApiError,
  noContent,
  ok,
  parseJsonBody,
  withErrorHandling,
} from "@/lib/http";
import { resolveWordIds } from "@/lib/words";
import {
  resolveTargetPhonemeId,
  serializeWordListDetail,
  wordListDetailInclude,
} from "@/lib/word-lists";
import { idParamSchema, wordListUpdateSchema } from "@/lib/validation";

type Context = RouteContext<"/api/word-lists/[id]">;

async function readId(ctx: Context) {
  const { id } = await ctx.params;

  return idParamSchema.parse(id);
}

/** GET /api/word-lists/:id — the list with its words in order, each with its phonemes. */
export const GET = withErrorHandling(async (_request: Request, ctx: Context) => {
  const id = await readId(ctx);

  const list = await prisma.wordList.findUnique({
    where: { id },
    include: wordListDetailInclude,
  });

  if (!list) {
    throw ApiError.notFound(`Word list ${id}`);
  }

  return ok(serializeWordListDetail(list));
});

/** PATCH /api/word-lists/:id */
export const PATCH = withErrorHandling(async (request: Request, ctx: Context) => {
  const id = await readId(ctx);
  const { name, description, targetPhoneme, words } = await parseJsonBody(
    request,
    wordListUpdateSchema,
  );

  const existing = await prisma.wordList.findUnique({ where: { id }, select: { id: true } });

  if (!existing) {
    throw ApiError.notFound(`Word list ${id}`);
  }

  const targetPhonemeId =
    targetPhoneme === undefined ? undefined : await resolveTargetPhonemeId(targetPhoneme);
  const wordIds = words ? await resolveWordIds(words) : null;

  const list = await prisma.$transaction(async (tx) => {
    if (wordIds) {
      await tx.wordListItem.deleteMany({ where: { wordListId: id } });
      await tx.wordListItem.createMany({
        data: wordIds.map((wordId, position) => ({ wordListId: id, wordId, position })),
      });
    }

    return tx.wordList.update({
      where: { id },
      data: {
        ...(name === undefined ? {} : { name }),
        ...(description === undefined ? {} : { description: description ?? null }),
        ...(targetPhonemeId === undefined ? {} : { targetPhonemeId }),
      },
      include: wordListDetailInclude,
    });
  });

  return ok(serializeWordListDetail(list));
});

/** DELETE /api/word-lists/:id */
export const DELETE = withErrorHandling(async (_request: Request, ctx: Context) => {
  const id = await readId(ctx);

  const list = await prisma.wordList.findUnique({
    where: { id },
    include: { _count: { select: { activities: true } } },
  });

  if (!list) {
    throw ApiError.notFound(`Word list ${id}`);
  }

  if (list._count.activities > 0) {
    throw ApiError.inUse(
      `Cannot delete "${list.name}" — ${list._count.activities} activity/activities still use it.`,
      { activities: list._count.activities },
    );
  }

  await prisma.wordList.delete({ where: { id } });

  return noContent();
});
