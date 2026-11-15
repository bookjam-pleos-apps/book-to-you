# BOOK TO YOU (북투유)

부모가 녹음한 목소리로 동화를 읽어 주는 Pleos Connect 차량 앱. "가장 사랑하는 목소리로, 너에게."

부모가 휴대폰 웹에서 목소리를 녹음하면 서버가 그 목소리로 동화 오디오를 만들고, 차에서는 QR로 연결해 받아 둔 이야기를 듣는다. 뒷좌석 벨트가 풀리거나 뒷문이 열리면 이야기를 멈추고 부모 목소리로 안내한다.

| 경로 | 내용 |
|---|---|
| `apps/vehicle/` | 차량 앱 (Android, Kotlin, Pleos Vehicle SDK). 상세는 [`apps/vehicle/README.md`](apps/vehicle/README.md) |
| `apps/web/` | 부모 웹 (React, Vite). 동의, 녹음, 책장, 차 연결 |
| `apps/api/` | 코어 API (Hono, Postgres, MinIO) |
| `packages/shared/` | API 계약 (zod) |
| `gpu/` | 목소리 클론 렌더 (Qwen3-TTS, Whisper, model-compose) |
| `content/` | 녹음 대본, 검수한 동화 원고, 원고 처리 도구 |
| `deploy/demo/` | 시연 서버 구성 |

## 실행 방법

세 방법 중 하나를 고른다. 앱 동작만 확인하려면 방법 1이면 된다.

### 방법 1. APK 설치 (가장 빠름)

Pleos Connect 에뮬레이터를 켜고 [APK 파일](apk/북잼_BookToYou_release.apk)을 받아 설치한다. 에뮬레이터 버전은 [아래 표](#pleos-connect-에뮬레이터-버전과-화면-규격)에 있다.

```sh
adb install apk/북잼_BookToYou_release.apk
```

런처에서 **BOOK TO YOU**를 연다. 처음 켜면 시연 계정에 자동으로 연결되고 동화 세 편이 책장에 보인다. 시연 서버에서 오디오를 받으므로 인터넷이 필요하다. 시연 계정은 2026-12-31까지 열려 있다.

- debug 빌드가 깔려 있으면 서명이 달라 설치가 실패한다. `adb uninstall com.voicestorybook.vehicle` 후 설치한다.
- 본인 목소리로 들으려면 정차(기어 P) 상태에서 홈의 "내 목소리로 시작하기"를 눌러 QR을 휴대폰으로 찍는다.

### 방법 2. 소스에서 빌드 (서버 없이)

픽스처 서버가 합성음으로 만든 책장을 내준다. macOS의 `say`를 쓴다.

```sh
cd apps/vehicle
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
python3 scripts/fixture-server.py           # :3100
./gradlew :app:installDebug -Pvehicle.debugApiBaseUrl=http://10.0.2.2:3100
```

### 방법 3. 전체 스택 (웹 + API + 차량)

녹음 확인과 동화 렌더는 GPU 서비스(`gpu/compose/voice-clone`, `.env`의 `COMPOSE_URL`)가 있어야 돈다. 없으면 녹음이 `checking`에 머물므로, GPU가 없을 때는 방법 1이나 2로 확인한다.

```sh
pnpm install
cp .env.example .env                                  # 비밀번호와 AUTH_SECRET을 바꾼다
docker compose up -d --wait postgres minio
pnpm --filter @voice-storybook/api dev:http           # :3000, 시작할 때 마이그레이션을 적용한다
pnpm --filter @voice-storybook/api dev:worker
pnpm --filter @voice-storybook/web dev                # :5173
cd apps/vehicle && ./gradlew :app:installDebug        # JAVA_HOME은 방법 2와 같다. 에뮬레이터 → http://10.0.2.2:3000
```

### 차량 신호 넣기

기어, 속도, 뒷문은 에뮬레이터의 Virtual Console이나 아래 스크립트로 바꾼다.

```sh
cd apps/vehicle
./scripts/vconsole.sh gear Drive            # 공회전: 연결·신고 버튼 숨김
./scripts/vconsole.sh speed 30              # 주행. 끝나면 speed 0
./scripts/vconsole.sh gear Park
./scripts/vconsole.sh door rear_left open   # 재생 중이면 멈춤
```

뒷좌석 벨트 값은 에뮬레이터에서 바꿀 수 없다. 재생 화면의 "벨트 해제 (에뮬레이터 시험용)" 토글이 실제 리스너와 같은 코드를 부른다.

## 테스트 환경 및 필요한 설정

| 항목 | 값 |
|---|---|
| 개발 장비 | macOS 27.2, Apple Silicon (arm64) |
| Node.js / pnpm | 24.1.0 / 10.33.0 (`.tool-versions`, `package.json`) |
| uv | 0.9.17 |
| ffmpeg | 8.1 (녹음 업로드 변환에 필요) |
| Docker | Postgres 17, MinIO |
| JDK | 21 (Gradle 8.11.1이 JDK 25에서 실패한다) |
| Android SDK | compileSdk 34, minSdk 28, targetSdk 34 |
| GPU (렌더만) | DGX Spark 또는 RTX 4090, Qwen3-TTS 1.7B Base + Whisper |

설정 파일:

- `.env`: `.env.example`을 복사해 쓴다. 저장소에 올리지 않는다.
- `apps/vehicle/local.properties`: `sdk.dir=<Android SDK 경로>`
- release 빌드: `-Pvehicle.releaseApiBaseUrl=https://...`와 서명 값 파일이 필요하다([`apps/vehicle/README.md`](apps/vehicle/README.md)의 "release 서명").

검사:

```sh
pnpm check                                  # 타입, lint, 의존 방향, 단위 테스트 (웹·API·렌더 엔진·원고 도구)
pnpm test:int                               # API 통합 테스트 (Docker 필요)
cd apps/vehicle && ./gradlew :core:test     # 차량 앱 순수 로직 (에뮬레이터 불필요)
```

`pnpm check`는 차량 앱과 GPU가 있어야 도는 코드를 포함하지 않는다. 렌더 엔진 테스트는 `uv`로 돈다.

검증하지 못한 것: 실제 Pleos 차량, 실제 뒷좌석 벨트 이벤트, 주행 중 `LIMIT_CONTENT`·`LIMIT_STRING_LENGTH` 제한(에뮬레이터가 보내지 않아 단위 테스트로만 확인).

## Pleos Connect 에뮬레이터 버전과 화면 규격

| 항목 | 값 |
|---|---|
| 에뮬레이터 | Pleos Connect v2.1.0 (AVD `Pleos_Connect_v2.1.0_2`, 콜드 부트) |
| 시스템 이미지 | `android-34/pleos_car_emulator/arm64-v8a` (Android 14, API 34) |
| 화면 | 2560×1440 px, 160 dpi (1 px = 1 dp), 가로 |
| 앱 창 (앱 1개) | 설계 1700×1184 dp, 에뮬레이터 실측 1682×1210 dp |
| 앱 창 (분할) | 설계 840×1184 dp, 에뮬레이터 실측 841×1210 dp |

설계 값은 Pleos Connect 디스플레이 가이드 2.1.5의 Connect-S 17인치 기준이다. 레이아웃은 가장 작은 분할 창(Connect-L 12.9인치, 628×855 dp)까지 맞췄고, 에뮬레이터에서는 앱 1개 창과 840폭 분할 창을 확인했다.

## APK

위치: [`apk/북잼_BookToYou_release.apk`](apk/북잼_BookToYou_release.apk)

| 항목 | 값 |
|---|---|
| 팀 / 앱 | 북잼 / BOOK TO YOU (북투유) |
| 패키지 | `com.voicestorybook.vehicle` 0.1.0 (versionCode 1) |
| sha256 | `c8cce67baaa083658eb0320d60189385d3b47638809bc4122fe1ccce4970a3be` |
| 서명 | APK Signature Scheme v2 |

직접 빌드하면 `apps/vehicle/app/build/outputs/apk/release/voice-storybook-vehicle-release.apk`에 생긴다.
