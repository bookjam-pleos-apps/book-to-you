# clone

음성 클론 엔진과 참조 녹음, 채점을 담당한다. 이 폴더에는 여러 패키지가 함께 쓰는 화자 목록, 폴더 규칙, 길이 예산이 있다.

## 하위 폴더

| 경로 | 역할 |
|---|---|
| `engine/` | Qwen3-TTS 클론 엔진과 그 포트, 모델 로더다. |
| `reference/` | 참조 녹음을 준비하고 검사한다. 전처리, 발성·스타일 검사, 동일인 유지다. |
| `scoring/` | 생성음을 채점한다. Whisper 받아쓰기와 CER, 화자 임베딩, MOS 예측이다. |
| `plan/` | 클론 비교 실험의 정의, 작업 목록, 실행과 요약이다. |

## 파일

| 파일 | 역할 |
|---|---|
| [budget.py](budget.py) | 한글 음절 수로 생성 토큰 예산을 잡고 예산에 닿았는지 본다. |
| [catalog.py](catalog.py) | data/의 화자, 참조 대본, 평가 문장 목록을 읽는다. |
| [cli_output.py](cli_output.py) | 진입점이 같이 쓰는 목록 출력과 실행 중단. |
| [identity.py](identity.py) | 화자 임베딩의 코사인 유사도와 중심 유사도를 계산한다. |
| [layout.py](layout.py) | 녹음과 출력 파일의 경로 규칙이다. |
| [meta_store.py](meta_store.py) | 생성 결과의 메타데이터(seed, 유사도 등)를 JSON 파일에 누적한다. |
