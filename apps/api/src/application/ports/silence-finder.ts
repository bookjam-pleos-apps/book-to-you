import type { Silence } from "../../domain/renders/chapter-plan";

// 렌더러가 넣은 문단 쉼(디지털 무음)만 찾는다. 말 사이의 자연스러운 쉼은 잡지 않아야 한다.
export interface SilenceFinder {
  findParagraphSilences(audio: Uint8Array): Promise<readonly Silence[]>;
}
