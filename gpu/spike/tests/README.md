# tests

Python 단위 테스트와 서비스 모의 구현이다. 테스트는 시험하는 패키지 이름의 폴더에 있고, 여러 테스트가 함께 쓰는 가짜 구현은 이 폴더에 있다.

저장소 루트에서 `pnpm test:spike`로 실행한다.

## 하위 폴더

| 경로 | 시험 대상 |
|---|---|
| `sound/` | 오디오 입출력과 신호 측정 |
| `clone/` | 클론 엔진, 참조 녹음, 채점 |
| `story/` | 원고 해석과 단위 분할 |
| `render/` | 단위 시도, 배치, 꼬리 자르기, 목소리 보정, 작업 폴더 |
| `compose/` | model-compose 워크플로우 정의와 호출 |
| `listening/` | 청취 파일과 판정 |
| `evaluation/` | 시험 세트, 클론 평가, 렌더 측정 |
| `cover/` | 표지 초점 분석 |
| `remote_queue/` | 원격 실험 대기열 |
| `entrypoints/` | 제품이 부르는 진입점(`run_*.py`) |
| `experiments/` | 실험 명령(`experiments/`) |
| `parity/` | API·공용 패키지와 같은 규칙을 쓰는지 대조 |

## 파일

- [conftest.py](conftest.py) — pytest 공통 설정·fixture
- [fake_compose_service.py](fake_compose_service.py) — 모의 model-compose 서버
- [fakes.py](fakes.py) — 테스트용 가짜 구현
- [job_fixture.py](job_fixture.py)
- [repeat_audio.py](repeat_audio.py)
- [skip_policy.py](skip_policy.py)
- [word_audio.py](word_audio.py)
- [word_transcriber.py](word_transcriber.py)

## 테스트 파일

- [test_package_direction.py](test_package_direction.py)
- [test_skip_policy.py](test_skip_policy.py)
