import { prisma } from "@/lib/prisma";
import { ApiError, noContent, withErrorHandling } from "@/lib/http";
import { readIdParam } from "@/lib/validation";

type Context = RouteContext<"/api/activities/[id]">;

/** DELETE /api/activities/:id — the word list it points at is left untouched. */
export const DELETE = withErrorHandling(async (_request: Request, ctx: Context) => {
  const id = await readIdParam(ctx.params);

  const activity = await prisma.activity.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!activity) {
    throw ApiError.notFound(`Activity ${id}`);
  }

  await prisma.activity.delete({ where: { id } });

  return noContent();
});
