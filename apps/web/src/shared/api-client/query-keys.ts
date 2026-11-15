// 서버 상태의 캐시 키를 한곳에 둔다. features는 서로 import하지 않으므로 무효화할 키를 여기서 공유한다.
export const QUERY_KEYS = {
  me: ["me"],
  terms: ["terms"],
  authOptions: ["auth-options"],
  voices: ["voices"],
  // 목록(voices)과 접두사를 나눈다. 목록을 무효화할 때 방금 받은 상세까지 다시 받지 않게 한다.
  voice: (voiceId: string) => ["voice", voiceId],
  recordingScripts: ["recording-scripts"],
  consentPhrase: (voiceId: string) => ["consent-phrase", voiceId],
  devices: ["devices"],
  library: ["library"],
  // 목록(library)과 접두사를 나눈다. 만들기 뒤 목록을 무효화할 때 듣고 있는 상세를 다시 받지 않게 한다.
  render: (renderId: string) => ["render", renderId],
  // 열어 둔 동화 상세 전부다. 동화나 목소리가 없어졌을 때(404) 함께 다시 받는다.
  renders: ["render"],
  stories: ["stories"],
} as const;
