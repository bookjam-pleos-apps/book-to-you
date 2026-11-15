import { createDemoSnapshotRepo } from "../adapters/db/repos/demo-snapshot-repo";
import { createVoiceRepo } from "../adapters/db/repos/voice-repo";
import type { Database } from "../adapters/db/client";
import { readDemoBundle, writeDemoBundle } from "../adapters/demo-bundle/bundle-file";
import {
  exportDemoVoice,
  importDemoClips,
  importDemoVoice,
  requestDemoRenders,
  type DemoClipFile,
  type DemoExport,
  type DemoImport,
  type ImportDemoClipsResult,
  type RequestDemoRendersResult,
} from "../application/demo";
import type { ObjectStorage } from "../application/ports/object-storage";
import type { Infrastructure } from "./infrastructure";
import { wireRequestRender } from "./renders";
import { wireUploadClip } from "./voices";

export type DemoTransferInfrastructure = {
  readonly database: Database;
  readonly storage: ObjectStorage;
};

export type DemoExportSummary =
  | { readonly kind: "exported"; readonly path: string; readonly userId: string; readonly renders: number; readonly objects: number }
  | Exclude<DemoExport, { readonly kind: "exported" }>;

export type DemoImportSummary = DemoImport | { readonly kind: "demo_not_configured" };

export const wireDemoTransfer = (infrastructure: DemoTransferInfrastructure, demoUserId: string | undefined) => {
  const deps = { repo: createDemoSnapshotRepo(infrastructure.database), storage: infrastructure.storage };
  return {
    exportTo: async (voiceId: string, path: string): Promise<DemoExportSummary> => {
      const result = await exportDemoVoice(deps)(voiceId);
      if (result.kind !== "exported") return result;
      await writeDemoBundle(path, result);
      const { snapshot, objects } = result;
      return { kind: "exported", path, userId: snapshot.userId, renders: snapshot.renders.length, objects: objects.length };
    },
    // demoUserId가 없으면 가져와도 데모 코드로 이 음성에 닿을 수 없다. 설정부터 맞추게 한다.
    importFrom: async (path: string): Promise<DemoImportSummary> => {
      if (demoUserId === undefined) return { kind: "demo_not_configured" };
      const bundle = await readDemoBundle(path);
      return importDemoVoice(deps, demoUserId)(bundle.snapshot, bundle.objects);
    },
  };
};

export type DemoClipImportSummary = ImportDemoClipsResult | { readonly kind: "demo_not_configured" };

export type DemoClipImportInfrastructure = Pick<Infrastructure, "database" | "storage" | "audio" | "queue" | "scripts">;

// 운영자가 가진 녹음(예: 사용자 본인의 s5_phone)을 데모 목소리 클립으로 올린다. 부모 업로드와 같은 경로다.
export const wireDemoClipImport = (infrastructure: DemoClipImportInfrastructure, demoUserId: string | undefined) => {
  const run = importDemoClips({
    voices: createVoiceRepo(infrastructure.database),
    scripts: infrastructure.scripts,
    uploadClip: wireUploadClip(infrastructure),
  });
  return async (files: readonly DemoClipFile[]): Promise<DemoClipImportSummary> =>
    demoUserId === undefined ? { kind: "demo_not_configured" } : run(demoUserId, files);
};

export type DemoRenderRequestSummary = RequestDemoRendersResult | { readonly kind: "demo_not_configured" };

export const wireDemoRenderRequest = (
  infrastructure: Pick<Infrastructure, "database" | "stories" | "scripts" | "clock">,
  demoUserId: string | undefined,
) => {
  const run = requestDemoRenders({ voices: createVoiceRepo(infrastructure.database), requestRender: wireRequestRender(infrastructure) });
  return async (storyIds: readonly string[]): Promise<DemoRenderRequestSummary> =>
    demoUserId === undefined ? { kind: "demo_not_configured" } : run(demoUserId, storyIds);
};
