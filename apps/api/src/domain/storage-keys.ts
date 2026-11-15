// 사용자 객체는 모두 이 아래에 있다. 고아 정리가 이 접두사를 훑는다.
export const USER_OBJECTS_PREFIX = "u/";

export const userPrefix = (userId: string): string => `${USER_OBJECTS_PREFIX}${userId}/`;

export const voicePrefix = (userId: string, voiceId: string): string => `${userPrefix(userId)}v/${voiceId}/`;

export const clipKey = (userId: string, voiceId: string, clipId: string): string =>
  `${voicePrefix(userId, voiceId)}clips/${clipId}.wav`;

export const promptKey = (userId: string, voiceId: string, promptId: string): string =>
  `${voicePrefix(userId, voiceId)}prompts/${promptId}.wav`;

export const consentAudioKey = (userId: string, voiceId: string, consentId: string): string =>
  `${voicePrefix(userId, voiceId)}consent/${consentId}.wav`;

const CHAPTER_HASH_CHARS = 16;

// 내용 해시를 키에 넣는다. 게시가 겹쳐도 서로의 객체를 덮어써 행의 해시와 어긋나는 일이 없다.
export const chapterKey = (userId: string, voiceId: string, renderId: string, index: number, sha256: string): string =>
  `${voicePrefix(userId, voiceId)}renders/${renderId}/${index}-${sha256.slice(0, CHAPTER_HASH_CHARS)}.m4a`;

const CONSENT_AUDIO = /\/consent\/([0-9a-f-]{36})\.wav$/;

export const consentIdOfKey = (key: string): string | null => CONSENT_AUDIO.exec(key)?.[1] ?? null;
