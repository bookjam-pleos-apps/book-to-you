import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";
import type { ClipFailure, Style } from "@voice-storybook/shared/vocab";

import { isApiError, type SignalReason } from "../../../shared/api-client/api-error";
import type { UploadOutcome } from "./upload-outcome";

export type Feedback = { readonly title: string; readonly body: string };

const SIGNAL_FEEDBACK: Record<SignalReason, Feedback> = {
  too_short: { title: "너무 짧아요", body: "대본을 끝까지 천천히 읽어 주세요." },
  too_long: { title: "너무 길어요", body: "조금 빠르게, 대본만 읽어 주세요." },
  clipped: { title: "소리가 깨졌어요", body: "휴대폰을 입에서 한 뼘쯤 떼고 다시 읽어 주세요." },
  too_noisy: { title: "주변이 조금 시끄러워요", body: "조용한 곳에서 한 번만 다시 읽어 주세요." },
  too_quiet: { title: "소리가 작아요", body: "휴대폰을 조금 더 가까이 두고 읽어 주세요." },
};

const CODE_FEEDBACK: Record<string, Feedback> = {
  unreadable: { title: "녹음을 읽지 못했어요", body: "한 번만 다시 녹음해 주세요." },
  no_active_consent: { title: "낭독 확인이 먼저 필요해요", body: "낭독 확인을 마친 뒤 녹음해 주세요." },
  invalid_phrase: { title: "확인 문장이 만료됐어요", body: "다시 녹음하면 새 문장이 나와요." },
  terms_outdated: { title: "약관이 바뀌었어요", body: "다시 로그인해 새 약관에 동의해 주세요." },
  network: { title: "인터넷이 끊겼어요", body: "연결을 확인하고 다시 올려 주세요." },
};

const FALLBACK: Feedback = { title: "올리지 못했어요", body: "잠시 뒤에 다시 올려 주세요." };

// 낭독 확인은 "대본"이 아니라 화면에 뜬 "문장"을 읽는다. 다시 녹음하면 새 문장을 받는다.
export const PHRASE_MISMATCH_FEEDBACK: Feedback = { title: "문장과 조금 달라요", body: "새 문장을 천천히 읽어 주세요." };

export const VERIFY_FAILED_FEEDBACK: Feedback = {
  title: "대본과 조금 달라요",
  body: "화면의 대본대로 다시 읽어 주세요.",
};

// 평소 목소리와 구별되지 않아도 통과한다. 막지 않고, 다시 읽어 보면 좋아질 점을 권한다.
const COACHING: Partial<Record<Style, Feedback>> = {
  child: { title: "조금 더 높게 읽어 볼까요?", body: "평소보다 높은 음으로 읽으면 아이 목소리가 더 살아나요." },
  deep: { title: "조금 더 낮게 읽어 볼까요?", body: "평소보다 낮고 굵게 읽으면 인물이 더 또렷해져요." },
  soft: { title: "조금 더 작고 느리게 읽어 볼까요?", body: "아이를 재울 때처럼 읽으면 더 포근하게 들려요." },
};

// 지금 검사 기준이 있는 style은 모두 제 문구가 있다. 기준 데이터(styleChecks)에 style이 늘었을 때의 대비다.
const COACHING_FALLBACK: Feedback = { title: "평소와 조금 다르게 읽어 볼까요?", body: "화면의 안내대로 읽으면 이야기가 더 다채로워져요." };

export const coachingFor = (style: Style): Feedback => COACHING[style] ?? COACHING_FALLBACK;

// 권유는 문제 안내(빨간 상자)가 아니라 권유 상자로 보인다.
export const isCoaching = (style: Style, feedback: Feedback): boolean => feedback === coachingFor(style);

// 예전 기준에서 구별되지 않아 탈락한 녹음이 남아 있다. 다시 녹음할 때 같은 권유를 보여 준다.
export const clipFailureFeedback = (style: Style, failure: ClipFailure | null): Feedback =>
  failure === "not_distinct" ? coachingFor(style) : VERIFY_FAILED_FEEDBACK;

// 다시 녹음하러 돌아온 화면에 보일 이유다. 통과했거나 확인 중인 녹음이 있으면 고칠 것이 없다.
// 탈락이 여럿이면 구별되지 않았다는 이유를 먼저 알린다. 녹음에 시각이 없어 마지막 탈락을 모르고, 대본만 다시 맞춰서는 고쳐지지 않는다.
export const earlierClipFailure = (voice: VoiceResponse, style: Style): Feedback | null => {
  if (voice.progress.find((item) => item.style === style)?.status !== "failed") return null;
  const failures = voice.clips.filter((clip) => clip.style === style && clip.status === "failed").map((clip) => clip.failure);
  return clipFailureFeedback(style, failures.find((failure) => failure === "not_distinct") ?? failures[0] ?? null);
};

// 서버가 여러 이유를 주면 첫 번째만 보여 준다. 한 번에 하나만 고치게 한다.
export const feedbackFor = (code: string, reasons: readonly SignalReason[]): Feedback => {
  const [first] = reasons;
  if (first !== undefined) return SIGNAL_FEEDBACK[first];
  return CODE_FEEDBACK[code] ?? FALLBACK;
};

export const feedbackFromError = (error: unknown): Feedback => {
  if (!isApiError(error)) return FALLBACK;
  if (error.failure.kind === "network") return feedbackFor("network", []);
  return feedbackFor(error.failure.code, error.failure.reasons);
};

export type RetryWay = "retake" | "reupload";

// 서버가 이 녹음 자체를 거절한 경우다. 같은 파일을 다시 올려도 결과가 같으니 새로 녹음해야 한다.
// 문장 토큰 만료(invalid_phrase)도 새 문장을 읽어야 하므로 새로 녹음한다.
const RETAKE_CODES: ReadonlySet<string> = new Set(["signal_rejected", "unreadable", "invalid_phrase"]);

export const retryWayOf = (error: unknown): RetryWay =>
  isApiError(error) && error.failure.kind === "http" && RETAKE_CODES.has(error.failure.code) ? "retake" : "reupload";

// 올리기가 실패했으면 오류로, 올라갔으면 판정으로 본다. 판정에서 떨어진 녹음도 새로 녹음해야 한다.
export const needsRetake = (error: unknown, outcome: UploadOutcome | undefined): boolean =>
  error === null ? outcome === "failed" : retryWayOf(error) === "retake";
