# 차량 앱 (Pleos Connect)

부모 목소리 동화의 차량 클라이언트. 코어 API에서 manifest와 오디오를 받아 두고, 정차 중 고른 이야기를 재생한다. 뒷좌석 벨트 해제와 뒷문 열림에 반응해 멈춘다.

앱 이름은 BOOK TO YOU(런처 라벨 `app_name`)다. `applicationId`와 APK 이름은 그대로 두고, 바꿀 때는 `gradle.properties`의 `vehicle.applicationId`, `vehicle.apkBaseName` 두 줄만 고친다.

## 구조

| 모듈 | 내용 | 의존 |
|---|---|---|
| `core` | 순수 로직과 유스케이스: 페어링 폴링(RFC 8628), manifest 해석, 캐시 차이와 오프라인 기한, 벨트·뒷문 전이 판정, 주행 제한 판단, 이어 듣기 | Kotlin/JVM만. Android·Pleos SDK를 import하면 컴파일이 실패한다 |
| `app` | 어댑터와 화면: OkHttp, 파일 캐시, Pleos Vehicle SDK, CarUxRestrictions, Media3·MediaSession | `core` |

의존 방향은 `core(순수 로직 ← 유스케이스, 포트 인터페이스) ← app(어댑터 ← VehicleSession 연결 상태 ← AppGraph 조립)` 한 방향이다.

## 준비

- JDK 21. Android Studio에 들어 있는 JDK 25로는 Gradle 8.11.1이 실패한다.
  `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`
- Android SDK(compileSdk 34), `local.properties`의 `sdk.dir`
- 에뮬레이터: AVD `Pleos_Connect_v2.1.0_2`(Pleos Connect v2.1.0, 콜드 부트)

## 명령 (작업할 때마다 돌린다)

```sh
cd apps/vehicle
./gradlew :core:test                 # 순수 로직 단위 테스트(에뮬레이터 불필요)
./gradlew :app:assembleDebug         # debug APK: app/build/outputs/apk/debug/<apkBaseName>-debug.apk
./gradlew :app:installDebug          # 에뮬레이터에 설치
```

루트 `pnpm check`는 이 앱을 포함하지 않는다. 에뮬레이터와 Gradle 데몬을 띄운 채 `pnpm check`를 돌리면 apps/api 테스트가 시간 초과로 실패할 수 있으니 `./gradlew --stop` 후 돌린다.

빌드 속성(`-P`로 넘긴다):

| 속성 | 기본값 | 용도 |
|---|---|---|
| `vehicle.debugApiBaseUrl` | `http://10.0.2.2:3000` | debug가 붙는 API. 에뮬레이터에서 `10.0.2.2`는 맥의 localhost |
| `vehicle.releaseApiBaseUrl` | 없음(필수) | release가 붙는 시연 서버의 https 출처. 없거나 https가 아니면 release 빌드가 실패한다 |
| `vehicle.releaseSigningProperties` | 없음(release 필수) | release 서명 값 파일의 절대 경로. 아래 "release 서명" |
| `vehicle.cabinDebugToggle` | `true` | 재생 화면의 벨트 시험 토글 |
| `vehicle.demoCodePairing` | `true` | 연결 화면의 심사자용 데모 코드 입력칸 |
| `vehicle.demoAutoPair` | `false` | 시연 빌드 전용. 연결이 없으면 데모 코드로 시연 계정에 자동으로 붙고, 홈에 "내 목소리로 시작하기"(QR 연결)를 둔다. 제품 빌드에서는 켜지 않는다 |
| `vehicle.demoAutoPairCode` | 없음 | `demoAutoPair`를 켤 때 필수인 데모 코드(영문·숫자·하이픈). 저장소에 쓰지 않고 `-P`나 `~/.gradle/gradle.properties`로 넣는다. 끄면 APK에 들어가지 않는다 |

평문 HTTP는 debug 빌드의 `network_security_config`(10.0.2.2, localhost)에서만 허용한다.

## 개발 서버

**로컬 API** (`:3000`, 다른 세션이 띄운 것을 쓴다)

차량 화면의 8자리 코드를 부모 계정으로 확인한다. 웹 화면이 없어 OTP 로그인과 `pair/confirm`을 스크립트로 보낸다. OTP는 dev 메일러가 쓴 API 로그에서 읽는다.

```sh
EMAIL=vehicle-dev@example.com ./scripts/confirm-pairing.sh ABCD-2345
# API=http://127.0.0.1:3000 API_LOG=/tmp/vs-api.log 가 기본값
```

POST에는 `content-type: application/json`이 있어야 한다. 없으면 서버 csrf가 403을 돌려준다.

**픽스처 서버** (`:3100`, 렌더가 없을 때)

계약 v1 모양의 manifest와 오디오를 내준다. 오디오는 macOS `say`로 만든 합성음이다. 목소리는 엄마(`fx-mom`, 대표 목소리)와 아빠(`fx-dad`) 둘이고, 벨트 안내도 목소리별로 하나씩 있다. 「빨간 모자」는 두 목소리로 있어 내 책장에서 한 권으로 묶인다. 페어링은 코드 `FIXT-URE2`를 보여 주고 약 10초 뒤 자동으로 연결된다.

```sh
python3 scripts/fixture-server.py
./gradlew :app:installDebug -Pvehicle.debugApiBaseUrl=http://10.0.2.2:3100
curl -X POST 'localhost:3100/__fixture/stories?count=1'   # manifest에서 빠진 이야기 삭제 시험
curl -X POST localhost:3100/__fixture/revoke              # 토큰 거부(연결 해제) 시험
curl -X POST 'localhost:3100/__fixture/set?offline=1'      # manifest 503(첫 동기화 실패 시험), 0이면 되돌림
curl -X POST 'localhost:3100/__fixture/set?holdPairing=1'  # 페어링을 확인 대기로 묶어 둠(주행 중 연결 화면 시험)
```

**시연 서버** (심사용 release)

서버 운영과 응답 표는 시연 서버 문서(`deploy/demo/README.md`)에 있다. 부모 로그인이 꺼져 있어 QR 연결은 쓰지 않고, 안내문의 데모 코드로 붙는다. 코드 값은 저장소에 쓰지 않는다.

```sh
./gradlew :app:assembleRelease -Pvehicle.releaseApiBaseUrl=https://<시연 서버 주소>
```

시연 빌드는 자동 연결을 켠다. 처음 켜면 시연 계정 책장이 바로 보이고, 자동 연결이 실패하면 연결 화면을 띄운 채 30초부터 두 배씩(상한 10분) 다시 시도한다. 시연 계정의 홈에는 "연결 끊기" 대신 "내 목소리로 시작하기"가 정차 중에만 보이고, 누르면 QR 연결 화면이 뜬다. QR로 연결하면 그 계정 책장으로 바뀌고, 그 계정에서 연결을 끊으면 다시 시연 계정에 붙는다.

```sh
./gradlew :app:assembleRelease -Pvehicle.releaseApiBaseUrl=https://<시연 서버 주소> -Pvehicle.demoAutoPair=true -Pvehicle.demoAutoPairCode=<데모 코드>
```

픽스처 서버에서는 데모 토큰의 책장이 한 권(「어부와 욕심많은 아내」)뿐이라 계정이 바뀌는 것을 눈으로 확인할 수 있다.

데모 코드는 숫자 16자리다(Pleos 키보드는 한글 자판이 기본이지만 숫자판이 늘 보여 자판을 바꾸지 않고 입력한다). 픽스처 서버의 코드는 `1234-5678-9012-3456`이다. 입력은 앞뒤 공백을 지우고 대문자로 바꿔 보내며, 구분자 없이 16자를 넣으면 4자리씩 끊는다.

**release 서명**

keystore와 비밀번호는 저장소에 두지 않는다. 저장소 밖 properties 파일에 네 값을 적고, 그 파일의 절대 경로만 `~/.gradle/gradle.properties`(개인 설정)에 한 줄로 둔다. 경로가 없거나 키가 빠지면 release 빌드가 실패한다. 서명 방법은 이것 하나다. `-Pandroid.injected.signing.*`만 넘기면 이 검사에 막힌다. 같은 앱으로 업데이트 설치하려면 최종본까지 같은 키로 서명해야 하니 키 파일은 따로 백업한다.

```properties
# ~/.gradle/gradle.properties
vehicle.releaseSigningProperties=/Users/<me>/.config/voice-storybook/release.properties

# release.properties (권한 600)
# storeFile은 절대 경로 또는 이 파일 기준 상대 경로. ~는 펼치지 않는다
storeFile=release.jks
storePassword=...
keyAlias=...
keyPassword=...
```

확인은 `local.properties`의 `sdk.dir` 아래 apksigner로 한다(맥 기본: `~/Library/Android/sdk/build-tools/34.0.0/apksigner verify --print-certs app/build/outputs/apk/release/*.apk`). 에뮬레이터에 debug 앱이 깔려 있으면 서명이 달라 설치가 실패하므로 debug를 지우고 설치한다.

## 디자인 시스템

값은 디자이너 Figma를 Pleos 키트에 맞춘 개선안을 따른다. 크기는 1700×1184 앱 창 기준 dp다.

| 무엇 | 파일 | 비고 |
|---|---|---|
| 색 | `res/values/colors.xml` | 라이트만. 글자색 `#131417` 100·84·64·32%는 Pleos text/dark 단계. 다크는 `values-night/colors.xml`에 같은 이름으로 |
| 주 버튼 색 | `colors.xml`의 `buttonBrand`, `onButtonBrand` | 이어서 듣기와 재생·멈춤 원은 이 두 색만 쓴다. 주황 위 글자는 대비 때문에 `#131417`(디자이너 확정, 2026-11-11) |
| 글자 스타일 | `res/values/text_styles.xml` | Pleos 키트 이름(HeadlineL, TitleM, BodyS 등). 글꼴은 `res/font/asta_sans.xml`(Asta Sans, OFL, `THIRD_PARTY_FONTS.md`) |
| 버튼·태그·그림자 스타일 | `res/values/themes.xml` | Pleos Basic button Large 100·Medium 80·Small 64. 태그는 누를 수 없는 표시라 버튼 스타일을 쓰지 않는다 |
| 크기 | `res/values-w1200dp/dimens.xml`(앱 1개 창, 17" 기준), `res/values/dimens.xml`(분할 창, 약 0.875배, 가장 낮은 628×855에 맞춤), `res/values-h1000dp/dimens.xml`(키 큰 분할 창의 재생 화면) | 분할 배치는 `pairingOrientation`·`homeOrientation`·`playerOrientation` |
| 모양 | `res/drawable/bg_*.xml`, `btn_*.xml`(물결) | 색·모서리는 토큰만 참조 |
| 아이콘 | `res/drawable/ic_*.xml` | Figma SVG를 옮긴 것. 색은 쓰는 쪽 tint |
| 표지 그림 | `res/drawable-nodpi/cover_<storyId>_{portrait,landscape}.webp` + `ui/CoverBinder.kt`의 `COVER_ART` 한 줄 + 초점 표 `assets/cover_focus.json` | 이어서 듣기·재생은 3:4, 책장은 16:9. 칸과 비율이 다르면 주인공(`gpu/spike/data/cover-protagonists.json`)을 반드시 온전히 넣고 그다음 인물이 가장 많이 온전히 보이게 자르고(`core/shelf/CoverCrop.kt`), 그림이 없으면 색 블록. 그림을 넣거나 바꾸면 초점 표를 다시 만든다(`gpu/compose/cover-focus/README.md`). 표지 칸 크기(`dimens.xml`의 `resumeCover*`·`playerCover*`·`thumb*`)를 바꾸면 미리보기 칸 `gpu/spike/src/spike/cover/cover_preview_plan.py`의 `SLOTS`도 같이 고친다 |

**그림자 규칙.** Pleos 그림자(Level 2·3)는 `android:elevation`과 그림자 색으로 흉내 낸다. 그림자 진하기(`spotShadowAlpha`·`ambientShadowAlpha`)는 뷰가 아니라 창 단위 테마 값이라 앱 테마에서 1로 두고, 실제 진하기는 각 뷰의 그림자 색 알파가 정한다. 그래서 elevation을 주는 뷰는 반드시 `Elevated.Level2`·`Elevated.Level3` 스타일(또는 그 자식 스타일)을 써야 한다. 그냥 `android:elevation`만 주거나 기본 Button(`stateListAnimator`)을 쓰면 그림자가 진한 검정으로 나온다. 버튼 기본 스타일 `Button`은 `stateListAnimator`를 꺼 두었다.

표지는 서버를 바꾸지 않고 앱이 이야기 id로 고른다(`core/shelf/Cover.kt`). 내 책장은 이야기(storyId)마다 책 한 권이고, 같은 이야기의 목소리들을 묶는다(`core/shelf/Books.kt`). 책 순서는 manifest에서 이야기가 처음 나온 순서다. 홈 위 상태 줄은 정상일 때 숨기고, 무엇을 보일지는 `core/usecase/LibraryNotice.kt`가 정한다.

## 동작 규칙

- 동기화: 앱을 열 때와 앱으로 돌아올 때(`onStart`) manifest를 받는다. 이미 받는 중이면 건너뛴다.
- 오프라인 기한: 마지막으로 manifest를 받은 뒤 `maxOfflineSeconds`가 지나면 받아 둔 오디오를 지우고 재생을 막는다. 토큰이 거부되면 바로 지운다. 받아 둔 목록을 읽을 수 없으면(스키마 변경 등) 만료가 아니라 "목록 없음"으로 지우고 다시 받는다.
- 주행 판단: 차량의 주행 상태를 읽지 못하면 주행 중으로 보고 잠근다. 이야기 고르기와 연결 코드(QR) 표시가 모두 막히므로, 실차에서 차량 서비스 연결이 실패하면 처음 연결도 할 수 없다. 실차 시험 때 확인할 항목이다.
- 이어 듣기: 장 끝 3초 안에서 멈췄으면 다음 장, 다 들었으면 처음부터, 중간이면 5초 앞에서 시작한다. 마지막 장이 끝나면 재생 서비스가 멈추고 1장 처음으로 되감아 둔다(화면 버튼과 스티어링 버튼 모두 처음부터 나온다).
- 벨트 안내: 지금 듣는 이야기와 같은 `voiceId`의 안내를 고르고, 없으면 다른 목소리의 안내를 튼다. 이야기가 재생 중일 때만 나오고, 앞에 180 ms 무음을 붙인다.
- 정차 중에만: 연결 코드(QR), 연결 끊기, 신고, 벨트 시험 토글. 주행이 시작되면 버튼을 숨기고 열린 팝업을 닫는다.
- 이야기 고르기: 주행 중에도 된다. `LIMIT_CONTENT`가 오면 받은 최대 항목 수까지만 보이고(이어서 듣기 카드 포함, 카드 이야기는 모든 목소리를 책장에서 빼고, 받아 둔 책 → 최근 들은 이야기 순). 내 책장은 한 단 목록이라 허용 깊이와 상관없다. `LIMIT_STRING_LENGTH`가 오면 제목과 안내를 받은 길이로 줄인다. 에뮬레이터는 이 두 플래그를 보내지 않아 단위 테스트로만 검증했다.
- 연결 끊기: 차 안의 이야기·기록·토큰만 지운다. 기기가 스스로 해제하는 API가 없어 서버의 기기 등록은 부모 웹에서 지운다.
- 신고: 신고를 받는 API가 없어 차에서는 보내지 않고 휴대폰에서 신고하라고 안내한다.
- Back 키: 재생 화면이면 목록으로, 그 밖에는 앱을 뒤로 보낸다(이야기는 계속 나온다).

## 차량 신호 넣기 (에뮬레이터)

```sh
./scripts/vconsole.sh gear Drive               # 공회전(속도 0): 연결·연결 끊기·신고 잠김, 이야기는 고를 수 있음
./scripts/vconsole.sh speed 30                 # 실제 주행(MOVING). 끝나면 speed 0
./scripts/vconsole.sh gear Park
./scripts/vconsole.sh door rear_left open      # 재생 중이면 멈춤
./scripts/vconsole.sh door rear_left close
adb shell input keyevent KEYCODE_MEDIA_PLAY_PAUSE   # 스티어링 버튼 대신
adb shell input keyevent KEYCODE_MEDIA_NEXT
```

Virtual Console(에뮬레이터 안 8088 포트)의 HTTP API를 쓴다. 벨트는 콘솔로 바꿀 수 없어 재생 화면의 "벨트 해제 (에뮬레이터 시험용)" 토글로 시연한다. 토글은 실제 리스너와 같은 `CabinGuard.onBelt`를 부른다.
