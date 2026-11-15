import { describe, expect, it } from "vitest";

import type { LibraryRepo, PlayableRender } from "../library/ports";
import type { NewReport, ReportRepo } from "./ports";
import { submitReport } from "./submit-report";

const render: PlayableRender = { renderId: "r1", storyId: "redhood", voiceId: "v1", voiceLabel: "엄마", chapters: [] };

const libraryOf = (renders: readonly PlayableRender[]): LibraryRepo => ({
  listPlayableRenders: async () => renders,
  findShelfRender: async (renderId) => renders.find((candidate) => candidate.renderId === renderId) ?? null,
  listRenderChapters: async () => [],
  listPlayablePrompts: async () => [],
  findDefaultVoiceId: async () => null,
  findPlayableChapter: async () => null,
  findPlayableAudio: async () => null,
});

const recorderOf = (saved: NewReport[]): ReportRepo => ({
  record: async (report) => {
    saved.push(report);
  },
});

describe("submitReport", () => {
  it("records a report for a story on the user's shelf with its story and voice", async () => {
    const saved: NewReport[] = [];
    const result = await submitReport({ reports: recorderOf(saved), library: libraryOf([render]) })({ userId: "u1", deviceId: "d1", renderId: "r1", reason: "voice" });
    expect(result).toEqual({ kind: "recorded" });
    expect(saved).toEqual([{ userId: "u1", deviceId: "d1", renderId: "r1", storyId: "redhood", voiceId: "v1", reason: "voice" }]);
  });

  it("refuses a story that is not on the user's shelf and records nothing", async () => {
    const saved: NewReport[] = [];
    const result = await submitReport({ reports: recorderOf(saved), library: libraryOf([render]) })({ userId: "u1", deviceId: null, renderId: "other", reason: "content" });
    expect(result).toEqual({ kind: "not_found" });
    expect(saved).toEqual([]);
  });
});
