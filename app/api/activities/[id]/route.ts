import { prisma } from "@/lib/prisma";
import { ApiError, noContent, ok, parseJsonBody, withErrorHandling } from "@/lib/http";
import {
  activityInclude,
  assertActivityIsSatisfiable,
  serializeActivity,
  toActivityData,
  toCreateInput,
} from "@/lib/activities";
import {
  activityCreateSchema,
  activityUpdateSchema,
  readIdParam,
} from "@/lib/validation";

type Context = RouteContext<"/api/activities/[id]">;

/** GET /api/activities/:id — one saved configuration. */
export const GET = withErrorHandling(async (_request: Request, ctx: Context) => {
  const id = await readIdParam(ctx.params);

  const activity = await prisma.activity.findUnique({
    where: { id },
    include: activityInclude,
  });

  if (!activity) {
    throw ApiError.notFound(`Activity ${id}`);
  }

  return ok(serializeActivity(activity));
});

/**
 * PATCH /api/activities/:id — edit a saved configuration in place.
 */
export const PATCH = withErrorHandling(async (request: Request, ctx: Context) => {
  const id = await readIdParam(ctx.params);
  const patch = await parseJsonBody(request, activityUpdateSchema);

  const existing = await prisma.activity.findUnique({
    where: { id },
    include: activityInclude,
  });

  if (!existing) {
    throw ApiError.notFound(`Activity ${id}`);
  }

  const merged = activityCreateSchema.parse({ ...toCreateInput(existing), ...patch });

  await assertActivityIsSatisfiable(merged, id);

  const activity = await prisma.activity.update({
    where: { id },
    data: await toActivityData(merged),
    include: activityInclude,
  });

  return ok(serializeActivity(activity));
});

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
