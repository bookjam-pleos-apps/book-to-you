// Chrome은 webm(Opus), Safari는 mp4(AAC)를 낸다. 서버가 ffmpeg로 mono WAV로 맞춘다(PLAN "웹 녹음 주의점").
const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"] as const;

export const pickRecordingMimeType = (isSupported: (mimeType: string) => boolean): string | null =>
  PREFERRED_MIME_TYPES.find((mimeType) => isSupported(mimeType)) ?? null;

export const fileExtensionFor = (mimeType: string): string => (mimeType.startsWith("audio/mp4") ? "m4a" : "webm");

// 처음에는 음성 처리를 끈다(클론 품질). iOS Safari는 잡음 억제와 자동 음량을 끌 수 없어 무시된다.
// 안드로이드 삼성 인터넷에서 처리를 끈 녹음이 무음으로 올라갔다. 무음이 나오면 브라우저 기본 처리로 다시 녹음한다.
export type MicProcessing = "off" | "browser";

const PROCESSING_OFF = {
  audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
} as const;

const BROWSER_DEFAULT = { audio: true } as const;

export const microphoneConstraints = (processing: MicProcessing): MediaStreamConstraints =>
  processing === "off" ? PROCESSING_OFF : BROWSER_DEFAULT;
