import { defineConfig } from "vitest/config";

export default defineConfig({
  // API 테스트는 PGlite 마이그레이션과 실제 ffmpeg를 돌려 CI에서 기본 5초를 넘길 수 있다.
  test: { include: ["apps/**/*.test.ts", "packages/**/*.test.ts", "tests/architecture/*.test.ts", "tests/parity/*.test.ts", "tests/scripts/*.test.ts"], testTimeout: 30_000 },
});
