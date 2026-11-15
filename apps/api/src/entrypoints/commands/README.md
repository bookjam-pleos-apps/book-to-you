# commands

운영자가 한 번씩 실행하는 명령이다. 끝나면 프로세스가 종료된다.

## 파일

| 파일 | 실행 | 역할 |
|---|---|---|
| [main-verify-pending.ts](main-verify-pending.ts) | `pnpm verify:pending` | 검사가 끝나지 않은 녹음을 다시 검사한다. |
| [main-render-batch.ts](main-render-batch.ts) | `pnpm render:batch` | 렌더 작업 폴더를 내보내고 결과를 게시한다. `scripts/render-batch.sh`가 부른다. |
| [main-reports-list.ts](main-reports-list.ts) | `pnpm reports:list` | 접수된 동화 신고를 출력한다. |
| [main-chapterize.ts](main-chapterize.ts) | `pnpm demo:chapterize` | 이미 렌더한 동화를 다시 렌더하지 않고 장으로 나눈다. |
| [main-demo-export.ts](main-demo-export.ts) | `pnpm demo:export` | 개발 DB의 렌더 결과를 시연 묶음 파일로 내보낸다. |
| [main-demo-import.ts](main-demo-import.ts) | `pnpm demo:import` | 시연 묶음 파일을 시연 서버에 넣는다. |
| [main-demo-clips-import.ts](main-demo-clips-import.ts) | `pnpm demo:clips` | 시연 계정의 목소리 녹음을 파일로 등록한다. |
| [main-demo-render-request.ts](main-demo-render-request.ts) | `pnpm demo:renders` | 시연 계정으로 동화 렌더를 요청한다. |
