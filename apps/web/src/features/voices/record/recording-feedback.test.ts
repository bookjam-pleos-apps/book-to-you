import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";
import type { ClipFailure, Style } from "@voice-storybook/shared/vocab";
import { describe, expect, it } from "vitest";

import { ApiError, toHttpFailure } from "../../../shared/api-client/api-error";
import { clipFailureFeedback, coachingFor, earlierClipFailure, isCoaching, VERIFY_FAILED_FEEDBACK } from "./recording-feedback";
import { feedbackFor, needsRetake, retryWayOf } from "./recording-feedback";

describe("recording feedback", () => {
  it("turns the server's signal rejection into one message to act on", () => {
    const failure = toHttpFailure(422, { error: "signal_rejected", reasons: ["too_noisy", "too_quiet"] });
    expect(failure).toEqual({ kind: "http", status: 422, code: "signal_rejected", reasons: ["too_noisy", "too_quiet"] });
    expect(feedbackFor("signal_rejected", ["too_noisy", "too_quiet"]).title).toBe("주변이 조금 시끄러워요");
  });

  it("explains known error codes and falls back for unknown ones", () => {
    expect(feedbackFor("no_active_consent", []).title).toBe("낭독 확인이 먼저 필요해요");
    expect(feedbackFor("internal_error", []).title).toBe("올리지 못했어요");
  });

  it("keeps the code even when the error body is not JSON", () => {
    expect(toHttpFailure(502, null)).toEqual({ kind: "http", status: 502, code: "unknown", reasons: [] });
  });

  it("coaches a passed reading with a suggestion, not a problem", () => {
    expect(coachingFor("child").title).toBe("조금 더 높게 읽어 볼까요?");
    expect(coachingFor("deep").title).toBe("조금 더 낮게 읽어 볼까요?");
    expect(coachingFor("soft").body).toBe("아이를 재울 때처럼 읽으면 더 포근하게 들려요.");
    expect(coachingFor("excited").title).toBe("평소와 조금 다르게 읽어 볼까요?");
  });

  it("shows the same suggestion for a reading that failed before coaching replaced the failure", () => {
    expect(clipFailureFeedback("child", "not_distinct")).toBe(coachingFor("child"));
    expect(isCoaching("child", clipFailureFeedback("child", "not_distinct"))).toBe(true);
    expect(isCoaching("child", clipFailureFeedback("child", "script_mismatch"))).toBe(false);
  });

  it("asks to follow the script for a wrong reading or a failure without a reason", () => {
    expect(clipFailureFeedback("child", "script_mismatch")).toBe(VERIFY_FAILED_FEEDBACK);
    expect(clipFailureFeedback("child", null)).toBe(VERIFY_FAILED_FEEDBACK);
  });
});

type ClipStatus = VoiceResponse["clips"][number]["status"];

const voiceWith = (style: Style, clips: readonly (readonly [ClipStatus, ClipFailure | null])[]): VoiceResponse => {
  const statuses = clips.map(([status]) => status);
  const best = (["passed", "checking", "failed"] as const).find((status) => statuses.includes(status)) ?? "missing";
  return {
    id: "v1",
    label: "엄마",
    consent: "active",
    consentRejected: false,
    isDefault: true,
    clips: clips.map(([status, failure], index) => ({ id: `c${index}`, style, status, failure, advice: null })),
    progress: [{ style, status: best }],
  };
};

describe("earlier clip failure", () => {
  it("says why the recording has to be made again", () => {
    expect(earlierClipFailure(voiceWith("child", [["failed", "not_distinct"]]), "child")?.title).toBe("조금 더 높게 읽어 볼까요?");
    expect(earlierClipFailure(voiceWith("child", [["failed", "script_mismatch"]]), "child")).toBe(VERIFY_FAILED_FEEDBACK);
  });

  it("puts the voice ahead of the script when both went wrong", () => {
    const voice = voiceWith("deep", [["failed", "script_mismatch"], ["failed", "not_distinct"]]);
    expect(earlierClipFailure(voice, "deep")?.title).toBe("조금 더 낮게 읽어 볼까요?");
  });

  it("says nothing once a recording passed or is being checked, or when none was made", () => {
    expect(earlierClipFailure(voiceWith("child", [["failed", "not_distinct"], ["passed", null]]), "child")).toBeNull();
    expect(earlierClipFailure(voiceWith("child", [["failed", "not_distinct"], ["checking", null]]), "child")).toBeNull();
    expect(earlierClipFailure(voiceWith("child", []), "child")).toBeNull();
    expect(earlierClipFailure(voiceWith("child", [["failed", "not_distinct"]]), "deep")).toBeNull();
  });
});

describe("retryWayOf", () => {
  const httpError = (status: number, body: unknown) => new ApiError(toHttpFailure(status, body));

  it("서버가 녹음 자체를 거절하면 새로 녹음하게 한다", () => {
    expect(retryWayOf(httpError(422, { error: "signal_rejected", reasons: ["too_noisy"] }))).toBe("retake");
    expect(retryWayOf(httpError(422, { error: "unreadable" }))).toBe("retake");
    expect(retryWayOf(httpError(400, { error: "invalid_phrase" }))).toBe("retake");
  });

  it("연결이나 서버 문제면 같은 녹음을 다시 올리게 한다", () => {
    expect(retryWayOf(new ApiError({ kind: "network" }))).toBe("reupload");
    expect(retryWayOf(httpError(502, null))).toBe("reupload");
    expect(retryWayOf(new Error("boom"))).toBe("reupload");
  });
});

describe("needsRetake", () => {
  it("올라간 녹음은 판정에서 떨어졌을 때만 새로 녹음한다", () => {
    expect(needsRetake(null, "failed")).toBe(true);
    expect(needsRetake(null, "passed")).toBe(false);
    expect(needsRetake(null, "checking")).toBe(false);
    expect(needsRetake(null, undefined)).toBe(false);
  });

  it("올리기가 실패했으면 오류 종류를 따른다", () => {
    expect(needsRetake(new ApiError(toHttpFailure(422, { error: "unreadable" })), undefined)).toBe(true);
    expect(needsRetake(new ApiError({ kind: "network" }), undefined)).toBe(false);
  });
});
