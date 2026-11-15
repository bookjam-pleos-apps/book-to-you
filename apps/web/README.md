# web

React·Vite 기반 부모 웹이다. 로그인, 차량 연결, 목소리 녹음, 동화 만들기와 듣기 화면이 있다.

## 하위 폴더

| 경로 | 역할 |
|---|---|
| `scripts/` | 휴대폰에서 웹을 확인하기 위한 터널 실행 스크립트다. |
| [src/](src/README.md) | 웹 화면과 브라우저 기능의 소스다. 앱 진입점은 app/main.tsx다. |

## 파일

- [components.json](components.json) — shadcn 컴포넌트 설정
- [index.html](index.html) — 웹 진입 HTML
- [package.json](package.json) — 실행 명령과 JavaScript 의존성
- [tsconfig.json](tsconfig.json) — TypeScript 검사 설정
- [tsconfig.node.json](tsconfig.node.json) — Vite 설정 파일의 TypeScript 검사
- [vite.config.ts](vite.config.ts) — Vite 빌드와 개발 API 프록시
