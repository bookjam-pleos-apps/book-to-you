import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";

export const errorResponse = (c: Context, status: ContentfulStatusCode, code: string): Response =>
  c.json({ error: code }, status);

const readBodyAsJson = (c: Context): Promise<unknown> => c.req.json().catch(() => undefined);

export const readJson = async <Schema extends z.ZodType>(
  c: Context,
  schema: Schema,
): Promise<z.infer<Schema> | null> => {
  const parsed = schema.safeParse(await readBodyAsJson(c));
  return parsed.success ? parsed.data : null;
};
