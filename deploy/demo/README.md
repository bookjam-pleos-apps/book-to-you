# 시연 서버

심사자와 차량 앱이 붙는 서버이고, 부모 웹도 같은 주소에서 연다. DGX Spark의 공용 `user` 계정에서 docker compose로 돌고, ngrok 무료 고정 도메인으로 공개된다. GPU는 쓰지 않는다. 렌더 결과는 개발 DB에서 묶음 파일로 옮겨 온다.

- 주소: `https://phytotoxic-ping-meniscoid.ngrok-free.dev` (시연 전용 ngrok 계정)
- 부모 로그인은 꺼져 있다(`LOGIN_MODE=disabled`). OTP 요청은 `503 login_disabled`다.
- 기기는 데모 코드로만 붙는다. 붙은 기기는 데모 계정의 동화만 읽는다.

## 차량 앱 연동

### 데모 코드

코드 값은 이 문서와 저장소에 쓰지 않는다. 운영자가 Spark에서 확인해 심사 안내문에 적는다.

```bash
ssh "$DGX_HOST" 'grep ^DEMO_PAIRING_CODE ~/voice-storybook-demo/deploy/demo/.env'
```

형식은 숫자 16자리를 4자리씩 하이픈으로 이은 `NNNN-NNNN-NNNN-NNNN`이다. Pleos 키보드가 한글 자판으로 뜨고 앱의 영문 자판 요청을 무시하지만, 숫자판은 늘 보여 자판을 바꾸지 않고 입력할 수 있다. 서버는 공백 제거나 하이픈 보정 없이 그대로 비교한다(하이픈 없이 보내면 `400`). 입력 화면에서 앞뒤 공백을 지우고 4자리씩 하이픈을 넣어 보내는 것은 앱의 몫이다. `DEMO_PAIRING_UNTIL`(지금 2026-12-31 23:59 KST)부터는 맞는 코드도 거부한다.

### 요청 규칙

- POST 본문은 JSON이고 `Content-Type: application/json`을 꼭 붙인다. 이 헤더가 없으면 CSRF 방어가 `403 {"error":"request_rejected"}`로 거부한다.
- 인증은 `Authorization: Bearer <accessToken>`이다. 쿠키는 쓰지 않는다.
- ngrok 무료 플랜은 브라우저처럼 보이는 요청(`User-Agent: Mozilla/...`)에 API 대신 `200 text/html` 경고 페이지를 돌려준다. 상태 코드가 200이라 놓치기 쉽다. OkHttp, `ExoPlayerLib/...`, `Dalvik/...` User-Agent는 통과하는 것을 확인했다. WebView나 브라우저 UA를 쓰는 경로는 모든 요청에 `ngrok-skip-browser-warning: 1` 헤더를 붙인다.
- 페어링 경로는 IP당 시간당 30회로 제한된다. 넘으면 `429 too_many_requests`다.

### 1. 페어링: `POST /v1/devices/pair/demo`

```json
{ "deviceName": "심사 차량", "demoCode": "NNNN-NNNN-NNNN-NNNN" }
```

| 응답 | 뜻 |
|---|---|
| `200 {"accessToken": "...", "tokenType": "Bearer"}` | 토큰을 저장한다. 만료가 없고, 기기 삭제로만 끊긴다 |
| `400 {"error":"invalid_demo_code"}` | 코드가 틀렸거나 시연 기간이 끝났다 |
| `400 {"error":"invalid_request"}` | 본문 형식이 틀렸다(`deviceName` 1~64자, `demoCode` 1~128자) |
| `503 {"error":"demo_not_ready"}` | 코드는 맞지만 서버에 데모 데이터가 없다. 운영자가 아래 "데이터 복구와 교체"로 다시 가져와야 한다 |
| `404 {"error":"not_found"}` | 데모 코드를 설정하지 않은 서버다. 경로 자체가 없다 |

같은 코드로 여러 차량이 붙을 수 있고, 붙을 때마다 기기가 하나씩 생긴다. 계약은 `packages/shared/src/contracts/v1/devices.ts`의 `pairDemoRequestSchema`, `pairTokenResponseSchema`다.

### 2. 목록: `GET /v1/library/manifest`

계약은 `packages/shared/src/contracts/v1/library.ts`의 `manifestSchema`다. `stories[].chapters[]`의 `audioUrl`(예: `/v1/audio/<id>`)을 서버 주소 뒤에 붙여 받는다. `sha256`과 `bytes`로 받은 파일을 검증하고, `maxOfflineSeconds`(7일) 안에서는 오프라인 재생해도 된다.

### 3. 오디오: `GET /v1/audio/<id>`

- `audio/mp4`(AAC m4a)이고 `Range` 요청을 받는다(`206`). `ETag`는 sha256이다.
- 오디오 안에 AI 생성 고지 메타데이터가 들어 있다.

### 기기 토큰으로 안 되는 것

`/v1/voices`처럼 부모용 경로는 `403`이다. 토큰이 없거나 틀리면 `401`이다.

## 운영

모든 명령은 Spark의 `~/voice-storybook-demo/deploy/demo`에서 실행한다. 공용 서버라 실행 전에 `nvidia-smi`, `docker ps`, `uptime`으로 다른 사람 작업을 먼저 본다.

```bash
docker compose --profile tunnel ps                 # 상태
docker compose --profile tunnel up -d --build      # 코드를 바꾼 뒤 다시 올리기
docker compose logs --tail 50 api                  # API 로그
```

- 모든 컨테이너는 `restart: unless-stopped`다. Spark는 GPU와 메모리를 같이 써서, 다른 작업이 메모리를 다 쓰면 컨테이너가 죽었다가 다시 뜰 수 있다.
- `worker`(같은 API 이미지, `main-worker.ts`)가 계정·목소리 삭제 뒤 저장소 객체를 지우고, 매일 고아 객체·만료된 로그인 기록을 정리한다. 없으면 삭제 요청이 `pending_purges`에 쌓이기만 한다. GPU를 붙일 때는 worker에도 `COMPOSE_URL`을 줘야 확인 대기 녹음의 매일 재확인이 실제로 돈다.
- 밖으로 연 포트가 없다. 바깥 요청은 ngrok 컨테이너만 받는다. ngrok은 `web`(nginx, `web-nginx.conf`)으로 보내고, `web`은 부모 웹 정적 파일을 주고 `/v1/`만 `api:3000`으로 넘긴다. 웹과 API가 한 출처라 세션 쿠키와 csrf Origin 검사가 그대로 맞는다.
- ngrok은 받은 `X-Forwarded-For` 뒤에 실제 접속 IP를 덧붙인다. API는 `TRUST_PROXY=true`로 맨 오른쪽 값만 믿는다. 그래서 nginx는 이 헤더에 자기 쪽 주소를 덧붙이지 않고 그대로 넘긴다. 덧붙이면 모든 요청이 ngrok 컨테이너 IP 하나로 보여 IP당 제한이 전체에 걸린다.
- 부모 웹은 모든 API 요청에 `ngrok-skip-browser-warning: 1`을 붙인다. 휴대폰으로 화면을 처음 열 때 ngrok 경고 페이지가 뜬다. 넘긴 기록(`abuse_interstitial` 쿠키)은 7일 가므로 그 뒤에 다시 한 번 뜬다(헤더를 붙일 수 없는 화면 탐색이라 피할 수 없다).
- 심사자 공개 시험(바로 시작하기)은 `.env`에 `QUICK_START=enabled`를 적고 `docker compose up -d api`로 연다. 기본은 꺼져 있고, 시연 서버는 켜 두었다. 켜 두면 주소를 아는 누구나 차 연결 코드를 받아 계정을 만들 수 있다.
- 비밀값은 `deploy/demo/.env`(권한 600, git 밖)에만 있다. 항목은 `.env.example`을 따른다.

### 데이터 복구와 교체

공용 docker라 남의 `docker system prune --volumes`에 볼륨이 지워질 수 있다. 그러면 페어링이 `503 demo_not_ready`로 바뀐다(`healthz`는 계속 200이다). 묶음 원본을 `~/voice-storybook-demo-data/bundle.json`에 둔다.

가져오기는 데모 사용자의 서재를 묶음 하나로 통째로 바꾼다. 묶음에 없는 음성·동의 행과 데모 사용자 경로의 객체는 지우고, 붙어 있는 기기는 남긴다. 그래서 다른 음성으로 바꿀 때도 같은 명령을 쓴다. 개발 DB를 잘못 덮지 않도록 `LOGIN_MODE=disabled`인 서버에서만 가져오기가 열린다(아니면 `demo_not_configured`).

```bash
# 맥(개발 DB)에서 내보내기. 활성 동의와 낭독 근거가 없는 음성은 거부한다.
pnpm --filter @voice-storybook/api demo:export <voiceId> /tmp/vs-demo/bundle.json
scp /tmp/vs-demo/bundle.json "$DGX_HOST":voice-storybook-demo-data/bundle.json

# Spark에서 가져오기. 묶음의 사용자가 DEMO_USER_ID와 다르거나 파일 해시가 다르면 거부한다.
docker compose exec -T api ./node_modules/.bin/tsx src/entrypoints/commands/main-demo-import.ts /dev/stdin < ~/voice-storybook-demo-data/bundle.json
```

묶음에는 렌더된 오디오와 동의 기록(낭독 문구, 일치 점수, 동의 시각, 약관 버전)만 들어간다. 원본 녹음 클립은 넣지 않고, 이메일은 `demo@voice-storybook.invalid`로 바꾼다. 가져오기는 쓰기 전에 묶음을 검사한다. 사용자, 낭독 근거, 오디오 해시가 맞아야 하고, 객체 키가 그 음성 경로 안에 있어야 하며, 챕터마다 렌더가 있어야 한다. 하나라도 어긋나면 아무것도 쓰지 않는다.

### 동의를 철회하면

개발 서버의 철회는 시연 서버에 저절로 전해지지 않는다. 시연 음성의 동의를 거두면 이 프로젝트의 볼륨을 통째로 지운다. 데모 사용자의 음성, 오디오, 기기가 모두 사라진다. 묶음 원본도 함께 지운다.

```bash
docker compose --profile tunnel down -v
rm ~/voice-storybook-demo-data/bundle.json
```

### 이미지 고정

postgres, minio, ngrok, node, nginx 이미지는 멀티 아키텍처 인덱스 digest로 고정했다. API 이미지의 ffmpeg는 Debian 패키지라 버전을 고정하지 않는다. debian-security는 최신 패치 버전만 남겨 고정하면 다음 보안 업데이트 뒤 빌드가 깨진다(작성 시점 5.1.9). 올릴 때는 `docker buildx imagetools inspect <이미지:태그>`의 `Digest`로 바꾼다. API 이미지는 `--prod`로 설치해 테스트·타입 도구가 없다. 서버를 tsx로 실행하므로 tsx는 `dependencies`에 둔다.

## GPU 서비스 (녹음 확인과 렌더)

녹음 확인(받아쓰기·check-clip)과 동화 렌더는 Spark의 voice-clone 서비스(`gpu/compose/voice-clone`, model-compose)가 한다. 시연 서버 compose 밖에서 systemd 사용자 서비스 `voice-storybook-voice-clone`으로 돈다(`voice-clone.service`, 죽으면 다시 띄움). 관리는 맥의 저장소 루트에서 `bash deploy/demo/gpu-service.sh check|sync|install|start|stop|status|verify`로 한다.

- 서비스는 docker0 주소 `172.17.0.1:18096`에만 연다. 인증이 없고 셸 단계가 있어 ngrok이나 밖으로 열면 안 된다. 컨테이너는 `host.docker.internal`(host-gateway)로 닿는다. 같은 장비의 다른 사람 컨테이너와 공용 계정 사용자도 이 주소에 닿는다(공용 계정이라 이미 같은 권한이다).
- `.env`에 `COMPOSE_URL=http://host.docker.internal:18096/api/workflows/runs`를 적고 `docker compose --profile tunnel --profile gpu up -d`로 api·worker를 다시 올리고 렌더 워커를 띄운다. `COMPOSE_URL`을 비우면 녹음은 "확인하고 있어요"에서 멈추고 렌더 요청은 대기열에만 쌓인다.
- Qwen과 whisper는 첫 요청에 GPU로 올라오고 5분 쉬면 내려간다(`~/.config/voice-storybook/voice-clone.env`의 `QWEN_IDLE_TIMEOUT`, `WHISPER_IDLE_TIMEOUT`, 0이면 안 내림). 메모리는 systemd가 48G에서 늦추고 56G에서 끊는다(배치 렌더 최대 37GB).
- 렌더 중에는 서비스를 내리지 않는다. 배치 렌더는 Spark 메모리를 최대 37GB 쓴다.
- `scripts/e2e-up.sh`·`e2e-down.sh`는 같은 폴더(`~/voice-storybook-api`)와 포트를 쓴다. 이 서비스가 active면 둘 다 바로 멈춘다. 반대로 e2e 서비스가 떠 있으면 `gpu-service.sh sync`·`start`가 멈춘다.

### 데모 목소리 녹음 가져오기

데모 목소리에 운영자가 가진 녹음(사용자 본인 녹음)을 클립으로 붙인다. 부모 웹 업로드와 같은 경로라 신호 검사, 저장, 녹음 확인(check-clip의 대본 일치와 style 구분)을 그대로 거친다. 그래서 GPU 서비스(`COMPOSE_URL`)가 붙어 있어야 한다. calm을 먼저 올리고, 이미 통과했거나 확인 중인 style은 건너뛴다. 동의는 데모 목소리에 있는 본인 동의를 쓴다. 클립 행에는 출처 칸이 없어 "운영자 가져옴"은 이 문서와 운영 기록에만 남는다.

```bash
# 녹음은 저장소에 두지 않는다. 컨테이너 /tmp에 넣고 끝나면 지운다.
docker compose exec -T api mkdir -p /tmp/demo-clips
docker compose cp ./calm.m4a api:/tmp/demo-clips/calm.m4a   # style마다
docker compose exec -T api ./node_modules/.bin/tsx src/entrypoints/commands/main-demo-clips-import.ts calm=/tmp/demo-clips/calm.m4a deep=/tmp/demo-clips/deep.m4a
docker compose exec -T -u root api rm -r /tmp/demo-clips
```

결과는 style마다 `passed`, `failed`(이유), `refused`(업로드 거부), `waiting_for_calm`(calm이 통과해야 판정됨), `already_recorded`, `no_script`다. 모두 통과해야 종료 코드 0이다. 같은 style을 두 번 넘기면 아무것도 올리지 않고 `duplicate_style`로 끝난다.

데모 계정에는 로그인 세션이 없어 웹의 "만들기"를 누를 수 없다. 같은 요청(대기열 상한 사용자당 3편, 같은 요청 재사용)을 운영자가 넣고, 렌더 워커(`gpu` 프로필)가 처리한다.

```bash
docker compose exec -T api ./node_modules/.bin/tsx src/entrypoints/commands/main-demo-render-request.ts redhood fisherman masteraway
```
