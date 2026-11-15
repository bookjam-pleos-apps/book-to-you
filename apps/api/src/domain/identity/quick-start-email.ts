// 차 QR로 이메일 없이 시작한 계정의 주소다. .invalid(RFC 2606)라 메일이 가지 않아 로그인 코드로는 들어올 수 없다.
const QUICK_START_EMAIL_DOMAIN = "quick-start.voice-storybook.invalid";

export const quickStartEmail = (accountKey: string): string => `quick-${accountKey}@${QUICK_START_EMAIL_DOMAIN}`;

export const isQuickStartEmail = (email: string): boolean => email.endsWith(`@${QUICK_START_EMAIL_DOMAIN}`);
