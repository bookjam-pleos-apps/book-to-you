import { chmod, readFile, writeFile } from "node:fs/promises";

import { CHAPTER_ROLES, PROMPT_KINDS } from "@voice-storybook/shared/vocab";
import { z } from "zod";

import { DEMO_SNAPSHOT_VERSION, type DemoSnapshot, type SnapshotObject } from "../../domain/demo/demo-snapshot";

const BUNDLE_FILE_MODE = 0o600;

const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

const storedAudio = {
  id: z.uuid(),
  storageKey: z.string().min(1),
  durationMs: z.int().nonnegative(),
  bytes: z.int().nonnegative(),
  sha256,
};

const snapshotSchema = z.object({
  userId: z.uuid(),
  voice: z.object({ id: z.uuid(), label: z.string().min(1) }),
  consent: z.object({
    id: z.uuid(),
    speakerLabel: z.string().nullable(),
    termsVersion: z.string().min(1),
    aiNoticeVersion: z.string().min(1),
    phrase: z.string().nullable(),
    phraseAudioSha256: sha256.nullable(),
    matchScore: z.number().nullable(),
    givenAt: instant,
  }),
  renders: z.array(
    z.object({
      id: z.uuid(),
      storyId: z.string().min(1),
      storyVersion: z.string().min(1),
      renderKey: z.string().min(1),
      refClipIds: z.array(z.uuid()),
      engineId: z.string().min(1),
      engineVersion: z.string().min(1),
      chaptersDone: z.int().nonnegative(),
      chaptersTotal: z.int().positive(),
      startedAt: instant.nullable(),
      finishedAt: instant.nullable(),
    }),
  ),
  chapters: z.array(z.object({ ...storedAudio, renderId: z.uuid(), index: z.int().nonnegative(), role: z.enum(CHAPTER_ROLES), title: z.string().min(1).nullable().default(null) })),
  prompts: z.array(z.object({ ...storedAudio, kind: z.enum(PROMPT_KINDS), scriptId: z.string().min(1), scriptVersion: z.string().min(1) })),
});

const bundleSchema = z.object({
  version: z.literal(DEMO_SNAPSHOT_VERSION),
  snapshot: snapshotSchema,
  objects: z.array(z.object({ key: z.string().min(1), contentType: z.string().min(1), base64: z.base64() })),
});

export type DemoBundle = {
  readonly snapshot: DemoSnapshot;
  readonly objects: readonly SnapshotObject[];
};

const toFileObject = (object: SnapshotObject) => ({
  key: object.key,
  contentType: object.contentType,
  base64: Buffer.from(object.bytes).toString("base64"),
});

// 오디오를 base64로 함께 담는다. 파일 하나라 scp 한 번으로 옮기고, 서버 홈에 복구용으로 남기기 쉽다.
// 부모 목소리가 든 파일이다. mode는 새로 만들 때만 적용되므로 덮어쓴 뒤에도 권한을 다시 좁힌다.
export const writeDemoBundle = async (path: string, bundle: DemoBundle): Promise<void> => {
  const file = { version: DEMO_SNAPSHOT_VERSION, snapshot: bundle.snapshot, objects: bundle.objects.map(toFileObject) };
  await writeFile(path, JSON.stringify(file), { mode: BUNDLE_FILE_MODE });
  await chmod(path, BUNDLE_FILE_MODE);
};

export const readDemoBundle = async (path: string): Promise<DemoBundle> => {
  const parsed = bundleSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const objects = parsed.objects.map(({ key, contentType, base64 }) => ({ key, contentType, bytes: new Uint8Array(Buffer.from(base64, "base64")) }));
  return { snapshot: parsed.snapshot, objects };
};
