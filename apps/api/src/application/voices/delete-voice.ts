import type { Clock } from "../ports/clock";
import { requestPurge, type JobQueue } from "../ports/job-queue";
import type { VoiceDeletionRepo } from "./ports";

export type VoiceDeletionDeps = {
  readonly deletion: VoiceDeletionRepo;
  readonly queue: JobQueue;
  readonly clock: Clock;
};

// 동의 철회도 이 경로다. 커밋이 끝나면 manifest와 audio에서 바로 사라진다.
export const deleteVoice =
  ({ deletion, queue, clock }: VoiceDeletionDeps) =>
  async (voiceId: string, userId: string): Promise<boolean> => {
    const deleted = await deletion.deleteVoice(voiceId, userId, clock());
    if (deleted) await requestPurge(queue);
    return deleted;
  };

export const deleteClip =
  ({ deletion, queue }: VoiceDeletionDeps) =>
  async (clipId: string, voiceId: string, userId: string): Promise<boolean> => {
    const deleted = await deletion.deleteClip(clipId, voiceId, userId);
    if (deleted) await requestPurge(queue);
    return deleted;
  };
