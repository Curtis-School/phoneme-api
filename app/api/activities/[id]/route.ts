import { prisma } from "@/lib/prisma";
import {
  ApiError,
  noContent,
  ok,
  parseJsonBody,
  withErrorHandling,
} from "@/lib/http";
import {
  activityInclude,
  assertActivityIsSatisfiable,
  serializeActivity,
  toActivityData,
  toCreateInput,
} from "@/lib/activities";
import {
  activityCreateSchema,
  activityPatchSchema,
  idParamSchema,
} from "@/lib/validation";

type Context = RouteContext<"/api/activities/[id]">;

async function readId(ctx: Context) {
  const { id } = await ctx.params;

  return idParamSchema.parse(id);
}

/** GET /api/activities/:id */
export const GET = withErrorHandling(async (_request: Request, ctx: Context) => {
  const id = await readId(ctx);

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
 * PATCH /api/activities/:id
 *
 * The patch is merged onto the stored row and the result validated against the create
 * schema, so a partial update is held to exactly the same rules as a create — a Wordle
 * cannot be edited into a state that is missing `maxGuesses`, for instance.
 */
export const PATCH = withErrorHandling(async (request: Request, ctx: Context) => {
  const id = await readId(ctx);
  const patch = await parseJsonBody(request, activityPatchSchema);

  const existing = await prisma.activity.findUnique({
    where: { id },
    include: activityInclude,
  });

  if (!existing) {
    throw ApiError.notFound(`Activity ${id}`);
  }

  const merged = activityCreateSchema.parse({ ...toCreateInput(existing), ...patch });

  await assertActivityIsSatisfiable(merged);

  const activity = await prisma.activity.update({
    where: { id },
    data: await toActivityData(merged),
    include: activityInclude,
  });

  return ok(serializeActivity(activity));
});

/** DELETE /api/activities/:id — the export history recorded against it cascades away. */
export const DELETE = withErrorHandling(async (_request: Request, ctx: Context) => {
  const id = await readId(ctx);

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
