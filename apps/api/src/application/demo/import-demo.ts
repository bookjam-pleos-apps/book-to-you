import {
  findSnapshotFlaw,
  matchesStoredAudio,
  missingProvenance,
  storedAudioOf,
  type DemoSnapshot,
  type SnapshotFlaw,
  type SnapshotObject,
  type StoredAudio,
} from "../../domain/demo/demo-snapshot";
import { userPrefix } from "../../domain/storage-keys";
import type { ObjectStorage } from "../ports/object-storage";
import type { DemoTransferDeps } from "./export-demo";

// 시연 서버는 로그인이 꺼져 있어 메일이 가지 않는다. 원래 주소는 옮기지 않는다.
export const DEMO_EMAIL = "demo@voice-storybook.invalid";

export type DemoImport =
  | { readonly kind: "imported"; readonly objects: number; readonly removedObjects: number }
  | { readonly kind: "not_demo_user"; readonly snapshotUserId: string }
  | { readonly kind: "missing_provenance"; readonly fields: readonly string[] }
  | { readonly kind: "invalid_snapshot"; readonly flaw: SnapshotFlaw }
  | { readonly kind: "corrupt_object"; readonly key: string };

const objectFor = (objects: readonly SnapshotObject[], audio: StoredAudio) =>
  objects.find((object) => object.key === audio.storageKey);

const firstUnmatchedAudio = (snapshot: DemoSnapshot, objects: readonly SnapshotObject[]) =>
  storedAudioOf(snapshot).find((audio) => {
    const object = objectFor(objects, audio);
    return object === undefined || !matchesStoredAudio(audio, object.bytes);
  });

const refuseImport = (snapshot: DemoSnapshot, objects: readonly SnapshotObject[], demoUserId: string): DemoImport | null => {
  if (snapshot.userId !== demoUserId) return { kind: "not_demo_user", snapshotUserId: snapshot.userId };
  const missing = missingProvenance(snapshot.consent);
  if (missing.length > 0) return { kind: "missing_provenance", fields: missing };
  const flaw = findSnapshotFlaw(snapshot);
  if (flaw !== null) return { kind: "invalid_snapshot", flaw };
  const unmatched = firstUnmatchedAudio(snapshot, objects);
  return unmatched === undefined ? null : { kind: "corrupt_object", key: unmatched.storageKey };
};

const putObjects = (storage: ObjectStorage, objects: readonly SnapshotObject[]) =>
  Promise.all(objects.map((object) => storage.put(object.key, object.bytes, object.contentType)));

// 행을 바꾼 뒤에는 데모 사용자 경로에서 스냅숏이 가리키지 않는 객체가 아무 행에도 쓰이지 않는다.
const removeStaleObjects = async (storage: ObjectStorage, userId: string, kept: ReadonlySet<string>): Promise<number> => {
  const stale = (await storage.list(userPrefix(userId))).map((object) => object.key).filter((key) => !kept.has(key));
  if (stale.length > 0) await storage.deleteKeys(stale);
  return stale.length;
};

// 객체를 먼저 올리고 행을 바꾼다. 행이 먼저 보이면 manifest가 아직 없는 오디오를 가리킨다.
export const importDemoVoice =
  (deps: DemoTransferDeps, demoUserId: string) =>
  async (snapshot: DemoSnapshot, objects: readonly SnapshotObject[]): Promise<DemoImport> => {
    const refused = refuseImport(snapshot, objects, demoUserId);
    if (refused !== null) return refused;
    const kept = new Set(storedAudioOf(snapshot).map((audio) => audio.storageKey));
    const referenced = objects.filter((object) => kept.has(object.key));
    await putObjects(deps.storage, referenced);
    await deps.repo.replaceLibrary(snapshot, DEMO_EMAIL);
    const removedObjects = await removeStaleObjects(deps.storage, snapshot.userId, kept);
    return { kind: "imported", objects: referenced.length, removedObjects };
  };
