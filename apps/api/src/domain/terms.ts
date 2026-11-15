export type TermsVersions = {
  readonly termsVersion: string;
  readonly aiNoticeVersion: string;
};

// 화면이 본 약관과 서버의 현재 약관이 같아야 계정을 만든다. 영수증에 남는 버전이 실제로 동의한 버전이 되게 한다.
export const isCurrentTerms = (current: TermsVersions, given: TermsVersions): boolean =>
  given.termsVersion === current.termsVersion && given.aiNoticeVersion === current.aiNoticeVersion;
