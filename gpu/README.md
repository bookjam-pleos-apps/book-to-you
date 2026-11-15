# gpu

음성 생성·분석 서비스와 렌더 엔진이다.

## 하위 폴더

| 경로 | 역할 |
|---|---|
| [compose/](compose/README.md) | 음성·원고·표지 분석 서비스의 워크플로우 정의다. |
| [spike/](spike/README.md) | 렌더 엔진과 음질 실험 코드다. 이름과 달리 서비스가 실제로 쓰는 렌더 로직이 여기 있다. 실험 명령은 `src/spike/experiments`에 있다. |
