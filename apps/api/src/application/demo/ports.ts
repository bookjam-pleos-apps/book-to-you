import type { DemoSnapshot } from "../../domain/demo/demo-snapshot";

export interface DemoSnapshotRepo {
  // 활성 동의가 있는 음성만 돌려준다. 동의가 철회됐거나 확인 중이면 null이다.
  readVoice(voiceId: string): Promise<DemoSnapshot | null>;
  // 데모 사용자의 음성과 그 동의를 모두 지우고 스냅숏 하나로 바꾼다. 기기는 사용자에 붙어 남는다.
  // 한 트랜잭션이라 중간 상태가 보이지 않는다.
  replaceLibrary(snapshot: DemoSnapshot, email: string): Promise<void>;
}
