import { z } from "zod";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Shared response envelope and error mapping for every route handler.
 *
 * Success bodies are returned as-is. Failures always look the same:
 *
 *   { "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
 *
 * so the frontend can branch on `code` rather than parsing prose.
 */

type ErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_JSON"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_REFERENCE"
  | "IN_USE"
  | "UNSATISFIABLE"
  | "INTERNAL_ERROR";

export function ok(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function created(data: unknown) {
  return Response.json(data, { status: 201 });
}

export function noContent() {
  return new Response(null, { status: 204 });
}

export function fail(
  status: number,
  code: ErrorCode,
  message: string,
  details?: unknown,
) {
  return Response.json(
    { error: details === undefined ? { code, message } : { code, message, details } },
    { status },
  );
}

/**
 * Thrown by handlers for failures the database cannot describe on its own — a missing
 * row looked up by hand, or a delete blocked because dependents exist.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static notFound(what: string) {
    return new ApiError(404, "NOT_FOUND", `${what} was not found.`);
  }

  static inUse(message: string, details?: unknown) {
    return new ApiError(409, "IN_USE", message, details);
  }
}

/** Reads and validates a JSON request body, distinguishing malformed JSON from invalid data. */
export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body is not valid JSON.");
  }

  const result = schema.safeParse(raw);

  if (!result.success) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Request body failed validation.",
      formatIssues(result.error),
    );
  }

  return result.data;
}

/** Flattens Zod issues into a compact, client-friendly list. */
function formatIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    code: issue.code,
    message: issue.message,
  }));
}

/**
 * Wraps a route handler so every thrown error becomes a consistent JSON response
 * instead of an unhandled 500 with an HTML body.
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

function toErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return fail(error.status, error.code, error.message, error.details);
  }

  if (error instanceof z.ZodError) {
    return fail(400, "VALIDATION_ERROR", "Request failed validation.", formatIssues(error));
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      // Unique constraint violation.
      case "P2002": {
        const fields = uniqueConstraintFields(error.meta);

        if (fields.length === 0) {
          return fail(409, "CONFLICT", "A record with those details already exists.");
        }

        return fail(
          409,
          "CONFLICT",
          fields.length === 1
            ? `A record with that ${fields[0]} already exists.`
            : `A record with that combination of ${formatList(fields)} already exists.`,
        );
      }

      // Foreign key constraint violation — the write pointed at a row that does not exist,
      // or a delete was blocked by dependants under onDelete: Restrict.
      case "P2003":
        return fail(
          400,
          "INVALID_REFERENCE",
          "The request references a record that does not exist, or is still in use.",
        );

      // An operation targeted a record that was not found.
      case "P2025":
        return fail(404, "NOT_FOUND", "The requested record was not found.");
    }
  }

  console.error("Unhandled API error:", error);

  return fail(500, "INTERNAL_ERROR", "Something went wrong handling the request.");
}

/**
 * Pulls the offending column names out of a P2002 error.
 *
 * Prisma reports these in `meta.target` when it talks to a database directly, but
 * behind a driver adapter (which Prisma 7 always uses) the detail arrives nested under
 * `meta.driverAdapterError` instead. Both shapes are read so the message can name the
 * field either way.
 */
function uniqueConstraintFields(meta: unknown): string[] {
  if (typeof meta !== "object" || meta === null) {
    return [];
  }

  const { target, driverAdapterError } = meta as {
    target?: unknown;
    driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } };
  };

  if (Array.isArray(target)) {
    return target.filter((field): field is string => typeof field === "string");
  }

  if (typeof target === "string") {
    return [target];
  }

  const fields = driverAdapterError?.cause?.constraint?.fields;

  return Array.isArray(fields)
    ? fields.filter((field): field is string => typeof field === "string")
    : [];
}

/**
 * Pluralises a noun against a count, e.g. `plural(1, "activity", "activities")`.
 *
 * Error messages are read by teachers, not just developers, so "1 activity" beats
 * "1 activity/activities". Irregular plurals are passed explicitly rather than guessed.
 */
export function plural(count: number, singular: string, pluralForm?: string) {
  const word = count === 1 ? singular : (pluralForm ?? `${singular}s`);

  return `${count} ${word}`;
}

/** Joins names for prose: "a", "a and b", "a, b and c". */
function formatList(items: string[]) {
  if (items.length < 2) {
    return items.join("");
  }

  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
