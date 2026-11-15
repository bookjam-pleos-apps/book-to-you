import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";
import { STYLES, type Style } from "@voice-storybook/shared/vocab";

import { STEP_TITLES } from "../step-titles";
import { clipStatusOf, isUnrecordedOptional } from "../voice-steps";

type ClipStatus = VoiceResponse["progress"][number]["status"];

// 버튼 없이 상태만 보인다. 남은 녹음은 화면 아래 "이어서 녹음하기" 하나로 순서대로 거친다.
// 정상(통과)은 ✓로, 문제(다시 녹음)는 빨간 글로, 기다림과 남은 녹음은 흐린 글로 보인다.
export type RowTone = "muted" | "danger";

export type StatusRow = {
  readonly title: string;
  readonly passed: boolean;
  readonly status: string | null;
  readonly tone: RowTone;
};

export type VoiceRow = StatusRow & { readonly style: Style };

const STATUS_TEXT: Record<ClipStatus, string | null> = {
  passed: null,
  checking: "확인 중",
  failed: "다시 녹음해 주세요",
  missing: "남았어요",
};

const rowOf = (voice: VoiceResponse, style: Style): VoiceRow => {
  const status = clipStatusOf(voice, style);
  return { style, title: STEP_TITLES[style], passed: status === "passed", status: STATUS_TEXT[status], tone: status === "failed" ? "danger" : "muted" };
};

const consentRow = (status: string | null, tone: RowTone = "muted"): StatusRow => ({ title: "낭독 확인", passed: status === null, status, tone });

// 확인된 낭독은 ✓만 보인다. 탈락했으면 다시 읽으라고, 확인 중이면 기다리라고, 안 했으면 남았다고 한다.
export const consentRowOf = (voice: VoiceResponse): StatusRow => {
  if (voice.consentRejected) return consentRow("다시 읽어 주세요", "danger");
  if (voice.consent === "checking") return consentRow("확인 중");
  return consentRow(voice.consent === "none" ? "남았어요" : null);
};

// 낭독 확인이 끝나기 전에는 감정 녹음을 올릴 수 없어 줄을 아예 보이지 않는다.
// 하지 않은 선택 녹음도 줄로 보이지 않는다. 등록을 마친 목소리 화면에서 따로 권한다.
export const voiceRows = (voice: VoiceResponse): readonly VoiceRow[] =>
  voice.consent === "active" ? STYLES.filter((style) => !isUnrecordedOptional(voice, style)).map((style) => rowOf(voice, style)) : [];

// 목소리가 하나뿐이면 대표를 고를 일이 없다. 배지도 버튼도 두 개 이상일 때만 보인다.
// 목록을 아직 받지 못했으면(undefined) 판단하지 않고 숨긴다.
export const showsDefault = (voiceCount: number | undefined): boolean => voiceCount !== undefined && voiceCount > 1;

export const canBeDefault = (voice: VoiceResponse, voiceCount: number | undefined): boolean => voice.consent === "active" && showsDefault(voiceCount);
