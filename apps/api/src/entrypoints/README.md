# entrypoints

프로세스가 시작하는 파일이다. 인자와 환경을 읽고 상위 `composition*.ts`가 조립한 것을 실행한다. 로직은 두지 않는다.

계속 떠 있는 서버·워커는 이 폴더에, 한 번 돌고 끝나는 운영자 명령은 `commands/`에 둔다. 실행 명령은 [package.json](../../package.json)의 scripts에 있다.

## 하위 폴더

| 경로 | 역할 |
|---|---|
| [commands/](commands/README.md) | 운영자가 한 번씩 실행하는 명령이다. 재검사, 수동 렌더, 신고 조회와 시연 데이터 작업을 한다. |

## 파일

| 파일 | 실행 | 역할 |
|---|---|---|
| [main-http.ts](main-http.ts) | `pnpm dev:http` | HTTP 서버를 시작하고 종료 신호에 정리한다. |
| [main-worker.ts](main-worker.ts) | `pnpm dev:worker` | 계정·목소리 삭제 뒤 저장소 객체를 지우고, 고아 객체와 만료 기록을 주기적으로 정리한다. |
| [main-render-worker.ts](main-render-worker.ts) | `pnpm render:worker` | 대기 중인 렌더를 GPU 서비스에 맡기고 결과를 게시한다. |
