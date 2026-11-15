import pytest

from spike.clone.engine.engine_ids import BATCH_ENGINE_ID, DIRECT_ENGINE_ID, WORKFLOW_ENGINE_ID
from spike.render.job.render_engine_setting import EngineSetting, engine_setting_from, load_engine_setting


def test_the_demo_server_renders_in_batches_with_the_voice_check():
    """exp_batch 블라인드 청취(직렬과 같음, child 지목 3/5 → 0/5)로 바꿨다. 다시 바꾸려면 청취 기록이 먼저다."""
    assert load_engine_setting() == EngineSetting(BATCH_ENGINE_ID, 8)


@pytest.mark.parametrize("raw", [{"engine": DIRECT_ENGINE_ID, "batchSize": 8}, {"engine": WORKFLOW_ENGINE_ID, "batchSize": 0}])
def test_a_setting_render_story_cannot_follow_is_refused(raw):
    with pytest.raises(ValueError):
        engine_setting_from(raw)


def test_the_batch_size_is_read_as_a_number():
    assert engine_setting_from({"engine": WORKFLOW_ENGINE_ID, "batchSize": "4"}) == EngineSetting(WORKFLOW_ENGINE_ID, 4)
