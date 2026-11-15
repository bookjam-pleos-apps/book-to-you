"""렌더 엔진 이름. 진입점이 엔진 구현(numpy, torch)을 끌어오지 않고 선택지를 만들 수 있게 따로 둔다.

apps/api/scripts/render-batch.sh도 같은 이름을 쓴다(tests/entrypoints/test_run_render_job.py가 맞는지 확인한다).
"""
DIRECT_ENGINE_ID = "qwen3-base"
COMPOSE_ENGINE_ID = "qwen3-base-compose"
# 단위 하나의 렌더 흐름(재시도, 받아쓰기, QC)까지 compose 워크플로우 render-unit에 맡긴다.
WORKFLOW_ENGINE_ID = "qwen3-base-workflow"
# 같은 style 단위 여러 개를 한 번에 생성하는 compose 워크플로우 render-batch를 라운드로 부른다.
BATCH_ENGINE_ID = "qwen3-base-batch"
ENGINE_IDS = (DIRECT_ENGINE_ID, COMPOSE_ENGINE_ID, WORKFLOW_ENGINE_ID, BATCH_ENGINE_ID)
SERVICE_ENGINE_IDS = (COMPOSE_ENGINE_ID, WORKFLOW_ENGINE_ID, BATCH_ENGINE_ID)
