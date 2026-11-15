import { isRedeemableDemoCode, type DemoPairing } from "../../domain/devices/demo-code";
import { confirmPairing, pollPairing, startPairing, type PairingDeps } from "./pairing";

export type DemoPairingDeps = PairingDeps & {
  readonly demo: DemoPairing;
  // 공용 docker에서 볼륨이 지워지면 데모 계정 행이 사라진다. 외래 키 오류 대신 준비 안 됨으로 알린다.
  readonly accountExists: (userId: string) => Promise<boolean>;
};

export type DemoPairingResult =
  | { readonly kind: "token"; readonly accessToken: string }
  | { readonly kind: "invalid_demo_code" }
  | { readonly kind: "demo_not_ready" };

// 심사자 기기를 데모 계정에 바로 잇는다. 일반 페어링의 시작, 확인, 토큰 발급을 그대로 거쳐
// 기기 행과 권한(manifest·audio 읽기만)이 일반 페어링과 같은 규칙으로 만들어진다.
export const redeemDemoCode =
  (deps: DemoPairingDeps) =>
  async (demoCode: string, deviceName: string): Promise<DemoPairingResult> => {
    if (!isRedeemableDemoCode(deps.demo, demoCode, deps.clock().getTime())) return { kind: "invalid_demo_code" };
    if (!(await deps.accountExists(deps.demo.userId))) return { kind: "demo_not_ready" };
    const started = await startPairing(deps)(deviceName);
    const confirmed = await confirmPairing(deps)(started.userCode, deps.demo.userId);
    if (!confirmed) throw new Error("데모 계정으로 페어링을 확인하지 못했다");
    const polled = await pollPairing(deps)(started.deviceCode);
    if (polled.kind !== "token") throw new Error(`데모 페어링이 토큰을 발급하지 못했다: ${polled.kind}`);
    return polled;
  };
