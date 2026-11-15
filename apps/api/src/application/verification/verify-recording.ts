import { ignoreFailure } from "../../domain/ignore-failure";
import type { ClipAnalyzer } from "../ports/clip-analyzer";
import type { Clock } from "../ports/clock";
import { ObjectMissing, readObjectBytes, type ObjectStorage } from "../ports/object-storage";
import type { Transcriber } from "../ports/transcriber";
import type { RecordingScripts } from "../recording-scripts";
import type { ClipCheckRepo, ConsentCheckRepo } from "./ports";

export type VerifyDeps = {
  readonly consents: ConsentCheckRepo;
  readonly clips: ClipCheckRepo;
  readonly storage: ObjectStorage;
  readonly transcriber: Transcriber;
  readonly analyzer: ClipAnalyzer;
  readonly scripts: RecordingScripts;
  readonly clock: Clock;
  readonly maxErrorRate: number;
  readonly reportFailure: (subject: string, error: unknown) => void;
};

// 동의 낭독과 녹음을 id로 확인하는 두 함수다. 요청 안에서 부르든 작업으로 돌리든 같은 것을 쓴다.
export type RecordingVerifier = {
  readonly consent: (consentId: string) => Promise<VerifyOutcome>;
  readonly clip: (clipId: string) => Promise<VerifyOutcome>;
};

// waiting은 대본은 맞았지만 비교할 calm이 아직 통과하지 않아 판정을 미룬 녹음이다.
export type VerifyOutcome = "passed" | "failed" | "skipped" | "waiting";

const nullWhenMissing = (error: unknown): null => {
  if (error instanceof ObjectMissing) return null;
  throw error;
};

// 객체가 없으면 null이다. 아무리 다시 확인해도 소용없어 탈락시키고, 그래야 다시 제출할 수 있다.
export const readObjectOrNull = ({ storage }: Pick<VerifyDeps, "storage">, key: string): Promise<Uint8Array | null> =>
  readObjectBytes(storage, key).catch(nullWhenMissing);

// 전사가 실패하면 예외가 올라가 행은 checking으로 남는다. 녹음을 잃지 않고 다시 시도할 수 있다.
export const transcribeObject = async (deps: Pick<VerifyDeps, "storage" | "transcriber">, key: string): Promise<string | null> => {
  const wav = await readObjectOrNull(deps, key);
  return wav === null ? null : deps.transcriber.transcribe(wav);
};

// 객체 삭제가 실패해도 판정은 유효하다. 남은 객체는 참조가 없으므로 고아 정리가 지운다.
export const discardObject = ({ storage }: Pick<VerifyDeps, "storage">, key: string): Promise<void> =>
  storage.deleteKeys([key]).catch(ignoreFailure);

export const settledOutcome = (settled: boolean, passed: boolean): VerifyOutcome => {
  if (!settled) return "skipped";
  return passed ? "passed" : "failed";
};
