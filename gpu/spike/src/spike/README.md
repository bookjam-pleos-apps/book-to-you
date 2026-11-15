# spike

렌더 엔진과 음질 실험 코드다. 이 폴더의 `run_*.py`는 제품이 부르는 진입점이고, 실험용 진입점은 `experiments/`에 있다. 진입점은 인자만 받고 로직은 기능별 패키지에 둔다.

## 하위 폴더

| 경로 | 역할 |
|---|---|
| [clone/](clone/README.md) | 음성 복제 엔진과 참조 녹음 준비를 담당한다. |
| `compose/` | model-compose HTTP 호출과 워크플로우 연결를 담당한다. |
| `cover/` | 표지 초점·인물 영역 분석를 담당한다. |
| [experiments/](experiments/README.md) | 음질 실험과 측정 명령이다. 제품 경로는 부르지 않는다. |
| [evaluation/](evaluation/README.md) | 음성 지표 계산과 평가 결과 비교를 담당한다. |
| `listening/` | 청취 평가 집합과 기록 관리를 담당한다. |
| `remote_queue/` | 원격 실험 대기열의 계획과 실행를 담당한다. |
| [render/](render/README.md) | 렌더 시도·품질 검사·반복 구간 제거를 담당한다. |
| `sound/` | 오디오 입출력, 전처리와 신호 측정를 담당한다. |
| `story/` | 원고 해석, 스타일 태깅과 렌더 단위 분할를 담당한다. |

## 제품이 부르는 진입점

API 배치 스크립트(`apps/api/scripts/render-batch.sh`)와 model-compose 워크플로우(`gpu/compose`)가 부른다.

| 파일 | 역할 |
|---|---|
| [run_render_job.py](run_render_job.py) | API 배치의 작업 폴더를 렌더한다. |
| [run_render_story.py](run_render_story.py) | compose 워크플로우 render-story·render-result·render-cleanup의 shell 단계. 결과를 JSON 한 줄로 stdout에 쓴다. |
| [run_render_step.py](run_render_step.py) | compose 워크플로우 render-attempt의 shell 단계. 단계마다 결과를 JSON 한 줄로 stdout에 쓴다. |
| [run_render_batch_step.py](run_render_batch_step.py) | compose 워크플로우 render-batch의 shell 단계. 배치 하나의 clone 입력(spec)과 뒤처리 단계의 결과를 JSON 한 줄로 stdout에 쓴다. |
| [run_voice_embed.py](run_voice_embed.py) | compose 워크플로우 voice-embed의 shell 단계. 음성 파일마다 ECAPA 화자 임베딩을 JSON 한 줄로 stdout에 쓴다. |
| [run_voice_measure.py](run_voice_measure.py) | compose 워크플로우 check-clip의 shell 단계. stdin으로 받은 녹음 하나의 음높이와 말한 시간을 JSON 한 줄로 stdout에 쓴다. |

## 콘텐츠 준비

동화 원고를 태깅해 확정본(`content/stories`)으로 만들고, 차량 앱 표지의 초점 표를 만든다.

| 파일 | 역할 |
|---|---|
| [run_tag_story.py](run_tag_story.py) | 원고를 태깅 초안으로 만든다. |
| [run_confirm_story.py](run_confirm_story.py) | 검수를 마친 초안을 확정본으로 만든다. |
| [guyeon_tools.py](guyeon_tools.py) | 구연 작업용 MCP 서버. 에이전트가 tool calling으로 부른다. |
| [run_cover_focus.py](run_cover_focus.py) | 차량 앱 표지마다 주인공 영역을 찾아 초점 표를 쓰고, 화면 칸별 전후 미리보기를 남긴다. |

## 파일

- [__init__.py](__init__.py)
