// 약관 본문 API는 없다. 버전은 계정을 만들 때 서버로 보낸다(otp/verify, pair/quick-start가 영수증을 쓴다).
// 목적이 다른 동의라 항목은 따로 두고, 한 번에 체크하는 "모두 동의"만 더한다.
export const AGREEMENTS = [
  { id: "terms", text: "이용약관과 개인정보 처리에 동의해요." },
  { id: "ai", text: "녹음한 목소리로 AI가 합성 음성을 만든다는 것을 알고 있어요." },
  { id: "guardian", text: "아이의 보호자로서 동의해요. 아이 목소리는 저장하지 않아요." },
] as const;

export type AgreementId = (typeof AGREEMENTS)[number]["id"];

export type Agreed = ReadonlySet<AgreementId>;

export const toggleAgreement = (current: Agreed, id: AgreementId, on: boolean): Agreed =>
  new Set([...current].filter((item) => item !== id).concat(on ? [id] : []));

export const agreeToAll = (on: boolean): Agreed => new Set(on ? AGREEMENTS.map((agreement) => agreement.id) : []);

export const isAllAgreed = (agreed: Agreed): boolean => AGREEMENTS.every((agreement) => agreed.has(agreement.id));
