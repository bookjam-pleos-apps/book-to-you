// 인앱 브라우저는 마이크 권한이나 쿠키가 막히는 경우가 많다. 외부 브라우저로 안내한다.
const IN_APP_MARKERS = [/KAKAOTALK/i, /NAVER\(inapp/i, /Instagram/i, /FBAN|FBAV/i, /\bLine\//i, /DaumApps/i];

export const isInAppBrowser = (userAgent: string): boolean => IN_APP_MARKERS.some((marker) => marker.test(userAgent));

// 인앱 브라우저에서도 그대로 써도 되는 곳은 만든 동화를 보고 듣는 책장뿐이다. 홈이 목소리별 책장이라 홈도 포함한다.
// 나머지(로그인, 녹음, 차 연결)는 계정 쿠키가 인앱 브라우저에 갇히거나 마이크가 막혀 바깥 브라우저로 보낸다.
const IN_APP_FRIENDLY_PATHS = ["/home", "/library"] as const;

const isUnder = (pathname: string, root: string): boolean => pathname === root || pathname.startsWith(`${root}/`);

export const needsOutsideBrowser = (pathname: string): boolean => !IN_APP_FRIENDLY_PATHS.some((root) => isUnder(pathname, root));

// 카카오톡은 이 주소로 열면 기기 기본 브라우저로 넘겨준다. 다른 앱은 방법이 없어 주소 복사만 안내한다.
export const externalOpenUrl = (userAgent: string, url: string): string | null =>
  /KAKAOTALK/i.test(userAgent) ? `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}` : null;
