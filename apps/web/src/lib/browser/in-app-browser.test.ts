import { describe, expect, it } from "vitest";

import { externalOpenUrl, isInAppBrowser, needsOutsideBrowser } from "./in-app-browser";

const KAKAO =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0";
const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

describe("in-app browser", () => {
  it("sends KakaoTalk in-app users to an outside browser but not Safari users", () => {
    expect(isInAppBrowser(KAKAO)).toBe(true);
    expect(isInAppBrowser(SAFARI)).toBe(false);
  });
});

describe("needsOutsideBrowser", () => {
  it("책장(홈과 듣기)만 인앱 브라우저에서 그대로 쓴다", () => {
    expect(needsOutsideBrowser("/home")).toBe(false);
    expect(needsOutsideBrowser("/library")).toBe(false);
    expect(needsOutsideBrowser("/library/r-1")).toBe(false);
    expect(needsOutsideBrowser("/voices/v1/record/calm")).toBe(true);
    expect(needsOutsideBrowser("/pair")).toBe(true);
    expect(needsOutsideBrowser("/login")).toBe(true);
    expect(needsOutsideBrowser("/libraryX")).toBe(true);
    expect(needsOutsideBrowser("/account")).toBe(true);
  });
});

describe("externalOpenUrl", () => {
  it("카카오톡이면 기본 브라우저로 여는 주소를 만든다", () => {
    expect(externalOpenUrl(KAKAO, "https://a.b/pair?code=X")).toBe("kakaotalk://web/openExternal?url=https%3A%2F%2Fa.b%2Fpair%3Fcode%3DX");
  });

  it("다른 앱은 여는 방법이 없다", () => {
    expect(externalOpenUrl(SAFARI, "https://a.b/")).toBeNull();
  });
});
