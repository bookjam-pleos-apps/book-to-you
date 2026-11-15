import type { RenderEngine, RenderOutput } from "../application/render-worker";
import type { RenderJob } from "../application/renders";
import type { EngineTaskState } from "../domain/render-worker/render-worker-plan";

// 렌더 장비 자리. task 상태와 장비의 작업 폴더를 메모리에 두고, 테스트가 끝내거나 잃게 만든다.
type FakeEngineState = {
  readonly tasks: Map<string, EngineTaskState>;
  readonly renderOfTask: Map<string, string>;
  readonly results: Map<string, RenderOutput>;
  readonly folders: Set<string>;
  readonly submitted: RenderJob[];
  readonly cancelled: string[];
  unreachable: boolean;
  // 제출이 장비에 닿은 직후 끼어드는 일(운영자 abandon 등)을 흉내 낸다.
  afterSubmit: () => Promise<void>;
};

export const createFakeRenderEngine = () => {
  const state: FakeEngineState = {
    tasks: new Map<string, EngineTaskState>(),
    renderOfTask: new Map<string, string>(),
    results: new Map<string, RenderOutput>(),
    folders: new Set<string>(),
    submitted: [],
    cancelled: [],
    unreachable: false,
    afterSubmit: async () => {},
  };
  const reachable = () => {
    if (state.unreachable) throw new Error("렌더 서비스에 닿지 못했다");
  };

  const engine: RenderEngine = {
    submit: async (job) => {
      reachable();
      const taskId = `T${state.submitted.length + 1}`;
      state.submitted.push(job);
      state.tasks.set(taskId, "running");
      state.renderOfTask.set(taskId, job.renderId);
      state.folders.add(job.renderId);
      await state.afterSubmit();
      return taskId;
    },
    taskState: async (taskId) => (state.unreachable ? "unreachable" : (state.tasks.get(taskId) ?? "gone")),
    result: async (renderId) => {
      reachable();
      return state.results.get(renderId) ?? null;
    },
    cancel: async (taskId) => {
      reachable();
      state.cancelled.push(taskId);
      if (state.tasks.get(taskId) === "running") state.tasks.set(taskId, "failed");
    },
    cleanup: async (renderId) => {
      reachable();
      return state.folders.delete(renderId);
    },
  };

  const finish = (taskId: string, output: RenderOutput) => {
    state.tasks.set(taskId, "completed");
    state.results.set(state.renderOfTask.get(taskId) ?? "", output);
  };

  return { state, engine, finish };
};
