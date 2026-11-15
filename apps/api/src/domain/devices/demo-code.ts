import { sameSecretText } from "../constant-time";
import { sha256Hex } from "../sha256";

// 시연 서버의 심사자용 페어링 설정. 코드 원문은 메모리에도 남기지 않고 해시만 둔다.
export type DemoPairing = {
  readonly codeHash: string;
  readonly userId: string;
  readonly untilMs: number;
};

export const hashDemoCode = (code: string): string => sha256Hex(code);

// 입력: 설정된 데모 페어링, 기기가 보낸 코드, 현재 시각. 코드가 맞고 아직 만료 전이면 참이다.
export const isRedeemableDemoCode = (demo: DemoPairing, presented: string, nowMs: number): boolean =>
  nowMs < demo.untilMs && sameSecretText(hashDemoCode(presented), demo.codeHash);
