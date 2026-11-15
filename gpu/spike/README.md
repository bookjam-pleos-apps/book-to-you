# spike

렌더 엔진과 음질 실험 코드다. 음성 클론 실험으로 시작해 이름이 spike지만, `gpu/compose`의 서비스와 API 배치가 이 패키지의 렌더 로직을 그대로 쓴다. 실험 명령은 `src/spike/experiments`에 따로 둔다.

## 하위 폴더

| 경로 | 역할 |
|---|---|
| `data/` | 화자, 녹음 대본, 실험 조건과 평가 집합을 정의한 JSON이다. |
| [src/spike/](src/spike/README.md) | 제품이 부르는 진입점(`run_*.py`), 실험 명령(`experiments/`)과 기능별 패키지다. |
| [tests/](tests/README.md) | Python 단위 테스트와 서비스 모의 구현이다. 시험하는 패키지 이름의 폴더로 나뉜다. |

## 파일

- [.gitignore](.gitignore) — Git에서 제외할 파일
- [pyproject.toml](pyproject.toml) — Python 의존성과 패키지·테스트 설정
- [uv.lock](uv.lock) — 고정된 Python 의존성 버전
