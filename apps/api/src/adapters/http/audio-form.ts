import type { Context } from "hono";
import type { z } from "zod";

export type AudioForm<Fields> = {
  readonly fields: Fields;
  readonly upload: Uint8Array;
};

const parseForm = (c: Context) => c.req.parseBody().catch(() => null);

export const readAudioForm = async <Schema extends z.ZodType>(
  c: Context,
  schema: Schema,
): Promise<AudioForm<z.infer<Schema>> | null> => {
  const form = await parseForm(c);
  if (form === null) return null;
  const audio = form["audio"];
  if (!(audio instanceof File)) return null;
  const fields = schema.safeParse(form);
  if (!fields.success) return null;
  return { fields: fields.data, upload: new Uint8Array(await audio.arrayBuffer()) };
};
