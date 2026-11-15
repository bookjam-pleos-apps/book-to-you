import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 웹 전용 API(:3001)다. 공용 :3000은 PUBLIC_ORIGIN이 localhost라 터널에서 온 업로드를 csrf가 막는다.
const apiOrigin = process.env["WEB_API_ORIGIN"] ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // shadcn 컴포넌트가 @/로 import한다. tsconfig.json paths와 같은 값이다.
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5173,
    strictPort: true,
    // 폰은 cloudflared 빠른 터널(*.trycloudflare.com)로 들어온다. 마이크와 __Host- 쿠키에 HTTPS가 필요하다.
    allowedHosts: [".trycloudflare.com"],
    // 동일 출처를 지킨다. /v1은 경로 그대로 API로 보내고 CORS는 열지 않는다.
    proxy: { "/v1": { target: apiOrigin } },
  },
});
