import type { AudioRange, EncodedChapter } from "./chapter-encoder";

// 이미 올린 장을 다시 인코딩하지 않고 자른다. 경계는 문단 쉼 한가운데라 프레임 단위로 잘려도 들리지 않는다.
export interface AudioCutter {
  cut(chapter: Uint8Array, range: AudioRange): Promise<EncodedChapter>;
}
