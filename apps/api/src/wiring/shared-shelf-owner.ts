import type { Env } from "../config";

export type SharedShelfEnv = Pick<Env, "DEMO_SHARED_SHELF" | "DEMO_USER_ID">;

// 시연 서버에서 책장을 함께 보여 줄 데모 계정. 설정이 꺼져 있으면 null이다.
export const sharedShelfOwnerOf = (env: SharedShelfEnv): string | null =>
  env.DEMO_SHARED_SHELF === "enabled" && env.DEMO_USER_ID !== undefined ? env.DEMO_USER_ID : null;
