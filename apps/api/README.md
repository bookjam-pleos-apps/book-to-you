# api

Hono 기반 API다. 계정·기기 연결·목소리 등록·렌더 요청과 오디오 제공을 담당한다.

## 하위 폴더

| 경로 | 역할 |
|---|---|
| `drizzle/` | DB 변경 이력이다. 번호 순서의 SQL과 Drizzle 메타데이터를 보관한다. |
| `scripts/` | 운영자가 직접 실행하는 배치 렌더 스크립트다. |
| [src/](src/README.md) | 서버 진입점과 설정, 각 계층을 연결하는 코드다. |

## 파일

- [Dockerfile](Dockerfile) — API 컨테이너 이미지 빌드
- [drizzle.config.ts](drizzle.config.ts) — DB 마이그레이션 도구 설정
- [package.json](package.json) — 실행 명령과 JavaScript 의존성
- [tsconfig.json](tsconfig.json) — TypeScript 검사 설정
