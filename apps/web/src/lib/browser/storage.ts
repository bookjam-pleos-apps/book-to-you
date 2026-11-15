// 브라우저 저장소 접근을 한곳에 둔다. 사생활 보호 모드 등에서는 접근만으로 예외를 던지는 브라우저가 있다.
export type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

const safely = (open: () => Storage): KeyValueStore | null => {
  try {
    return open();
  } catch {
    return null;
  }
};

// 기기에 남길 값(마이크 처리 방식 등)이다.
export const localStore = (): KeyValueStore | null => safely(() => window.localStorage);

// 탭을 닫으면 지워질 값(이번 방문에서 이미 본 안내 등)이다.
export const sessionStore = (): KeyValueStore | null => safely(() => window.sessionStorage);
