# cover-focus

차량 앱 표지마다 주인공 박스를 찾아 초점 표(`apps/vehicle/app/src/main/assets/cover_focus.json`)를 만든다. 앱은 이 표로 칸 비율에 맞춰 자른다(`core/shelf/CoverCrop.kt`). 표지가 몇 장뿐이라 맥에서 돌린다(GPU 불필요). 표지를 넣거나 바꿀 때만 돌린다.

| 워크플로우 | 하는 일 | 부품 |
|---|---|---|
| `locate-subjects` | 표지를 28px 격자 크기로 맞춘 뒤 주인공 박스를 JSON으로 받는다 | `image-processor`(resize) → `image-text-to-text`(Qwen2.5-VL-3B) |
| `preview-crop` | 앱이 그릴 영역을 잘라 칸 크기로 줄인다 | `image-processor`(crop → resize) |
| `mark-subjects` | 원본에 주인공을 모두 덮는 박스를 그린다 | `image-drawing`(rectangle) |

자를 위치 계산은 워크플로우가 아니라 `spike.cover.cover_crop`(앱 `cropRegion`과 같은 계산, 공유 사례 `apps/vehicle/core/src/test/resources/cover-crop-cases.json`)이 한다. 주인공 박스(`protagonist: true`)는 반드시 온전히 넣고(칸보다 크면 주인공 가운데), 그 안에서 온전히 보이는 인물이 가장 많은 위치를 고르며, 같으면 초점(인물 전체의 가운데)에 가까운 쪽이다. 주인공 표시가 없는 표지는 인물 수 규칙만 쓴다.

주인공은 사람이 동화 제목과 원고로 정해 `gpu/spike/data/cover-protagonists.json`에 적는다(표지마다 주인공 몸 안의 점 하나, 그 점을 품은 가장 작은 박스가 주인공). VLM을 다시 돌려도 표시가 이어진다.

## 실행

```bash
cd gpu/compose/cover-focus
uv sync --locked
uv run --locked model-compose -f model-compose.yml up      # 127.0.0.1:18097, 첫 기동은 모델 7GB를 받는다

# 다른 터미널
cd gpu/spike
UV_PROJECT_ENVIRONMENT=.venv-check uv run --locked --exact --group dev python -m spike.run_cover_focus
```

- 표지 한 장에 30~40초(M 시리즈, MPS). 4장과 미리보기 36장에 약 8분.
- 결과: 초점 표(커밋 대상)와 미리보기 `reports/vehicle-ui/cover-focus/previews/index.md`(칸별 지금/초점 비교, 주인공 박스). 미리보기를 보고 이상하면 표의 `subjects`를 손으로 고쳐도 된다. 앱은 `label`을 읽지 않는다.
- 주인공만 바꿨으면 서버 없이 `python -m spike.run_cover_focus --mark-only`로 표의 표시만 다시 쓴다. 출력에서 표지마다 어느 박스가 주인공인지 확인한다.
- 끝나면 서버를 내린다. `uv run`을 끊어도 python 자식이 남을 수 있으니 `pgrep -f cover-focus/.venv/bin/python`으로 확인한다.

## 함정

- 기본 `device_mode: auto`는 맥 통합 메모리를 다 쓰지 못하고 일부를 디스크로 내려 한 장에 10분이 걸렸다. `device_mode: single`, `device: mps`, `precision: bfloat16`으로 둔다.
- 프롬프트에 JSON 모양을 글로 지시하면 박스 하나만 평문으로 답했다. Qwen2.5-VL 예제의 grounding 문구("Output their bbox coordinates in JSON format")를 쓴다.
- 답의 좌표는 모델 입력(28px 격자로 맞춘 크기)의 픽셀이다. 그래서 격자 크기로 먼저 맞춰 넘기고 그 크기로 나눈다.
