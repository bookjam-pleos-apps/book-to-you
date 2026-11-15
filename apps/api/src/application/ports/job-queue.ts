import { ignoreFailure } from "../../domain/ignore-failure";

export interface JobQueue {
  enqueueVerifyClip(clipId: string): Promise<void>;
  enqueueVerifyConsent(consentId: string): Promise<void>;
  enqueuePurge(): Promise<void>;
}

// 아래는 모두 행이 커밋된 뒤에 부른다. 신호를 못 넣어도 행이 남아 리컨실러가 다시 처리하므로 요청을 실패시키지 않는다.
export const requestPurge = (queue: JobQueue): Promise<void> => queue.enqueuePurge().catch(ignoreFailure);

export const requestVerifyClip = (queue: JobQueue, clipId: string): Promise<void> =>
  queue.enqueueVerifyClip(clipId).catch(ignoreFailure);

export const requestVerifyConsent = (queue: JobQueue, consentId: string): Promise<void> =>
  queue.enqueueVerifyConsent(consentId).catch(ignoreFailure);
