import { prisma } from "@/lib/prisma";
import { created, ok, parseJsonBody, parseQuery, withErrorHandling } from "@/lib/http";
import {
  activityInclude,
  assertActivityIsSatisfiable,
  serializeActivity,
  toActivityData,
} from "@/lib/activities";
import { activityCreateSchema, activityQuerySchema } from "@/lib/validation";

/** GET /api/activities — saved configurations, filtered by `?type=`, `?difficulty=`, `?wordListId=`. */
export const GET = withErrorHandling(async (request: Request) => {
  const { type, difficulty, wordListId } = parseQuery(request, activityQuerySchema);

  const activities = await prisma.activity.findMany({
    where: { type, difficulty, wordListId },
    include: activityInclude,
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return ok(activities.map(serializeActivity));
});

/** POST /api/activities — save a new Wordle or Word Search configuration. */
export const POST = withErrorHandling(async (request: Request) => {
  const input = await parseJsonBody(request, activityCreateSchema);

  await assertActivityIsSatisfiable(input);

  const activity = await prisma.activity.create({
    data: await toActivityData(input),
    include: activityInclude,
  });

  return created(serializeActivity(activity));
});
