# src

진입점과 설정, 각 계층을 연결하는 코드다. 서버는 `entrypoints/main-http.ts`에서 시작한다.

## 하위 폴더

| 경로 | 역할 |
|---|---|
| [adapters/](adapters/README.md) | HTTP, DB, 파일, 오디오 도구처럼 외부 시스템과 통신하는 구현이다. 필요한 인터페이스는 application에 있다. |
| [application/](application/README.md) | 유스케이스와 외부 기능 인터페이스다. 다른 모듈에서는 각 폴더의 index.ts로 접근한다. |
| [entrypoints/](entrypoints/README.md) | 프로세스가 시작하는 파일이다. 서버·워커와 운영자 명령으로 나뉜다. |
| [domain/](domain/README.md) | DB나 HTTP 없이 계산하는 규칙이다. 인증 코드, 녹음 판정, 렌더 계획 등을 다룬다. |
| `testing/` | API 테스트에서 함께 쓰는 데이터와 가짜 구현이다. |
| `wiring/` | 유스케이스에 저장소·외부 서비스 구현을 연결한다. 최종 조립은 상위 composition.ts에서 한다. |

## 파일

- [composition-demo.ts](composition-demo.ts) — 시연 서버 운영자 명령의 조립
- [composition-workers.ts](composition-workers.ts) — HTTP 밖에서 도는 워커·명령의 조립
- [composition.ts](composition.ts) — 서버·워커의 최종 의존성 조립
- [config.ts](config.ts) — 환경변수와 운영 정책

## 테스트 파일

- [composition.test.ts](composition.test.ts)
