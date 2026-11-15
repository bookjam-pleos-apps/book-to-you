import { resolve } from "node:path";

import { clipResponseSchema } from "@voice-storybook/shared/contracts/v1";
import type { Style } from "@voice-storybook/shared/vocab";

import { loadRecordingScripts } from "../adapters/content/recording-scripts";
import { createClipRepo } from "../adapters/db/repos/clip-repo";
import { createConsentRepo } from "../adapters/db/repos/consent-repo";
import { verifyClip } from "../application/verification/verify-clip";
import type { VerifyDeps } from "../application/verification/verify-recording";
import type { TestRuntime } from "./test-runtime";
import { clipFields, postForm, validClip } from "./voices";

export const RECORDING_SCRIPTS = loadRecordingScripts(resolve(import.meta.dirname, "../../../../content/scripts/recording-scripts.json"));

export const scriptOf = (style: Style): string => RECORDING_SCRIPTS.clips.find((clip) => clip.style === style)?.text ?? "";

export const clipVerifier = (runtime: TestRuntime, analyzer: VerifyDeps["analyzer"], reportFailure: VerifyDeps["reportFailure"] = () => undefined) =>
  verifyClip({
    consents: createConsentRepo(runtime.database),
    clips: createClipRepo(runtime.database),
    storage: runtime.storage,
    transcriber: { transcribe: () => Promise.reject(new Error("clips are not transcribed alone")) },
    analyzer,
    scripts: RECORDING_SCRIPTS,
    clock: runtime.clock,
    maxErrorRate: 0.2,
    reportFailure,
  });

export const uploadClipOf = async (runtime: TestRuntime, voiceId: string, cookie: string, style: Style): Promise<string> => {
  const response = await postForm(runtime, `/v1/voices/${voiceId}/clips`, cookie, clipFields(style), validClip());
  if (response.status !== 202) throw new Error(`clip upload answered ${response.status}`);
  return clipResponseSchema.parse(await response.json()).id;
};
