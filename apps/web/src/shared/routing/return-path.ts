export const HOME_PATH = "/home";

const RETURN_PARAM = "next";

const DEL = 0x7f;
const FIRST_PRINTABLE = 0x20;

// URL 파서는 탭·줄바꿈을 지운다. "/\t/evil.com"이 "//evil.com"이 되므로 제어 문자가 있으면 받지 않는다.
const hasControlCharacter = (value: string): boolean =>
  [...value].some((char) => char.charCodeAt(0) < FIRST_PRINTABLE || char.charCodeAt(0) === DEL);

// 열린 리다이렉트를 막는다. 같은 출처의 경로만 받는다("//evil.com", "/\evil.com"은 다른 호스트로 해석된다).
export const safeReturnPath = (raw: string | null): string => {
  if (raw === null || !raw.startsWith("/") || hasControlCharacter(raw)) return HOME_PATH;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return HOME_PATH;
  return raw;
};

export const loginPathReturningTo = (pathWithSearch: string): string =>
  `/login?${new URLSearchParams({ [RETURN_PARAM]: pathWithSearch }).toString()}`;

export const readReturnPath = (search: string): string => safeReturnPath(new URLSearchParams(search).get(RETURN_PARAM));
