# experiments

음질 실험과 측정에 쓰는 명령이다. 제품의 렌더 경로는 이 폴더를 부르지 않는다(`tests/test_package_direction.py`가 확인한다).

`gpu/spike`에서 `uv run python -m spike.experiments.<폴더>.<이름>`으로 실행한다. 인자는 각 파일 머리의 설명에 있다.

## 하위 폴더

| 경로 | 역할 |
|---|---|
| `clone/` | 참조 녹음을 만들고 검사하며, 클론 비교 실험을 생성·평가한다. |
| `render/` | 동화 한 편을 직접 렌더하고 단위 길이, 앞부분 조건, 후보 고르기를 실험한다. |
| `listening/` | 블라인드 청취용 파일과 정답표를 만들고 청취 답으로 판정한다. |
| `measure/` | 렌더를 재고 조건끼리 비교한다. 경보, 시험 세트, 지표와 청취의 일치도다. |

## 파일

| 파일 | 역할 |
|---|---|
| [run_compose_parity.py](run_compose_parity.py) | 직접 호출과 model-compose 결과를 비교한다. |
| [run_queue.py](run_queue.py) | GPU 장비에서 실험 큐를 이어 돌린다. |
| [run_style_eval.py](run_style_eval.py) | test-sentences로 라벨링 방법을 비교한다. |
