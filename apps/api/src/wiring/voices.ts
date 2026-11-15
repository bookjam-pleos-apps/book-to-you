import type { Hono } from "hono";

import { createClipRepo } from "../adapters/db/repos/clip-repo";
import { createConsentRepo } from "../adapters/db/repos/consent-repo";
import { createDeletionRepo } from "../adapters/db/repos/deletion-repo";
import { createPromptRepo } from "../adapters/db/repos/prompt-repo";
import { createVoiceRepo } from "../adapters/db/repos/voice-repo";
import type { AppEnv } from "../adapters/http/principal";
import { uploadBodyLimit } from "../adapters/http/upload-limit";
import { recordingRoutes } from "../adapters/http/routes/recording-routes";
import { voiceRoutes } from "../adapters/http/routes/voice-routes";
import {
  createVoice,
  deleteClip,
  deleteVoice,
  getVoice,
  issueConsentPhrase,
  listVoices,
  submitConsent,
  updateVoice,
  uploadClip,
  uploadPrompt,
} from "../application/voices";
import { POLICY, type Env } from "../config";
import type { Infrastructure } from "./infrastructure";

const wireProfileRoutes = ({ database, scripts, queue, clock }: Infrastructure) => {
  const voices = createVoiceRepo(database);
  const deletionDeps = { deletion: createDeletionRepo(database), queue, clock };
  return voiceRoutes({
    deleteVoice: deleteVoice(deletionDeps),
    deleteClip: deleteClip(deletionDeps),
    createVoice: createVoice({ voices }),
    listVoices: listVoices({ voices }),
    getVoice: getVoice({ voices }),
    updateVoice: updateVoice({ voices }),
    scripts,
  });
};

type RecordingInfrastructure = Pick<Infrastructure, "database" | "storage" | "audio" | "queue">;

const recordingShared = ({ database, storage, audio, queue }: RecordingInfrastructure) => ({
  voices: createVoiceRepo(database),
  consents: createConsentRepo(database),
  storage,
  audio,
  queue,
  signalLimits: POLICY.signal,
});

// 부모 업로드와 운영자 가져오기(데모 목소리)가 같은 검사·저장·확인 경로를 쓴다.
export const wireUploadClip = (infrastructure: RecordingInfrastructure & Pick<Infrastructure, "scripts">) =>
  uploadClip({
    ...recordingShared(infrastructure),
    clips: createClipRepo(infrastructure.database),
    scripts: infrastructure.scripts,
    duration: POLICY.duration.clip,
  });

const wireRecordingRoutes = (env: Env, infrastructure: Infrastructure) => {
  const { database, clock, scripts } = infrastructure;
  const shared = recordingShared(infrastructure);
  const consentDeps = {
    ...shared,
    clock,
    secret: env.AUTH_SECRET,
    phraseTtlMs: POLICY.consentPhraseTtlMs,
    duration: POLICY.duration.consent,
    termsVersion: env.TERMS_VERSION,
    aiNoticeVersion: env.AI_NOTICE_VERSION,
  };
  return recordingRoutes({
    issueConsentPhrase: issueConsentPhrase(consentDeps),
    submitConsent: submitConsent(consentDeps),
    uploadClip: wireUploadClip(infrastructure),
    uploadPrompt: uploadPrompt({ ...shared, prompts: createPromptRepo(database), scripts, duration: POLICY.duration.prompt }),
    uploadBodyLimit: uploadBodyLimit(POLICY.upload.maxBytes),
  });
};

export const wireVoiceRoutes = (env: Env, infrastructure: Infrastructure) => {
  const registerProfiles = wireProfileRoutes(infrastructure);
  const registerRecordings = wireRecordingRoutes(env, infrastructure);
  return (app: Hono<AppEnv>): void => {
    registerProfiles(app);
    registerRecordings(app);
  };
};
