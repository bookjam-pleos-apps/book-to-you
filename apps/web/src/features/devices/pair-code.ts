// 서버 user-code.ts와 같은 알파벳이다. 차 화면에서 옮겨 적기 쉽게 0, O, 1, I를 뺐다.
const USER_CODE_PATTERN = /^[2-9A-HJ-NP-Z]{8}$/;

export const normalizePairCode = (input: string): string => input.toUpperCase().replaceAll(/[^0-9A-Z]/g, "");

export const isCompletePairCode = (code: string): boolean => USER_CODE_PATTERN.test(code);

// 차 QR은 `${verificationUri}?code=${userCode}`다(QrBitmap.kt). 하이픈이 섞여 와도 받는다.
export const readPairCode = (search: string): string | null => {
  const raw = new URLSearchParams(search).get("code");
  if (raw === null) return null;
  const code = normalizePairCode(raw);
  return isCompletePairCode(code) ? code : null;
};

export const formatPairCode = (code: string): string => code.match(/.{1,4}/g)?.join("-") ?? code;
