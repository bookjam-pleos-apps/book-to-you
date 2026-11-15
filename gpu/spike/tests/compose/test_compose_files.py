"""validate는 오타 필드를 통과시킬 수 있어, 동등성에 영향을 주는 값을 파싱 결과에서 직접 확인한다."""
import tomllib
from pathlib import Path

import pytest
from mindor.core.compose.validator import ComposeValidator
from mindor.dsl.loader import load_compose_config
from mindor.dsl.schema.compose import ComposeConfig

from spike.compose.compose_client import COMPOSE_MODEL, DEFAULT_URL, LONG_TRANSCRIBE_WORKFLOW, TRANSCRIBE_WORKFLOW
from spike.compose.compose_voice_embed import VOICE_EMBED_WORKFLOW
from spike.sound.ffmpeg_runner import ffmpeg_command
from spike.clone.reference.ref_prep import build_args
from spike.clone.scoring.whisper_window import WHISPER_WINDOW_SEC
from spike.compose.workflow_batch_render import RENDER_BATCH_WORKFLOW
from spike.compose.workflow_render import RENDER_UNIT_WORKFLOW

COMPOSE_DIR = Path(__file__).parents[3] / "compose"
VOICE_CLONE_DIR = COMPOSE_DIR / "voice-clone"
SPIKE_DIR = Path(__file__).parents[2]
SHARED_LIBRARIES = ("qwen-tts", "transformers", "accelerate", "torch", "torchaudio")
SOURCE_PLACEHOLDER = "file:${input.source_path}"
OUTPUT_PLACEHOLDER = "file:${input.output_path}"


@pytest.fixture(scope="module")
def voice_clone() -> ComposeConfig:
    return load_compose_config(str(VOICE_CLONE_DIR), [VOICE_CLONE_DIR / "model-compose.yml"], {})


def component(config: ComposeConfig, component_id: str):
    return next(item for item in config.components if item.id == component_id)


def test_voice_clone_passes_validation(voice_clone: ComposeConfig):
    assert ComposeValidator(voice_clone).validate() == []


# spike가 HTTP로 부르는 워크플로는 서비스에 있어야 한다. voice-embed 워크플로가 빠져 시연 렌더가 모두 끝에서 실패했다.
def test_every_workflow_the_spike_calls_is_served(voice_clone: ComposeConfig):
    served = {workflow.id for workflow in voice_clone.workflows}
    called = {TRANSCRIBE_WORKFLOW, LONG_TRANSCRIBE_WORKFLOW, RENDER_UNIT_WORKFLOW, RENDER_BATCH_WORKFLOW, VOICE_EMBED_WORKFLOW}

    assert called - served == set()


def test_service_listens_only_on_loopback_where_the_client_calls_it(voice_clone: ComposeConfig):
    adapter = voice_clone.controller.adapters[0]

    assert adapter.host == "127.0.0.1"
    assert DEFAULT_URL == f"http://{adapter.host}:{adapter.port}{adapter.base_path}/workflows/runs"
    assert voice_clone.controller.max_concurrent_count == 3
    assert voice_clone.controller.webui is None


def test_clone_keeps_the_settings_the_spike_measured(voice_clone: ComposeConfig):
    clone = component(voice_clone, "qwen-clone")
    action = clone.actions[0]

    assert (clone.model.repository, clone.attn_implementation, clone.max_concurrent_count) == (COMPOSE_MODEL, "sdpa", 1)
    assert (action.language, action.non_streaming_mode) == ("ko", True)
    assert action.seed == "${input.seed}"
    assert action.max_new_tokens == "${input.max_new_tokens}"
    assert action.subtalker_temperature == "${input.temperature}"
    assert ";path" in action.reference_audio


def test_transcribe_keeps_the_spike_whisper_settings(voice_clone: ComposeConfig):
    whisper = component(voice_clone, "whisper")
    action = whisper.actions[0]

    assert (whisper.model.repository, whisper.max_concurrent_count) == ("openai/whisper-large-v3", 1)
    assert (whisper.precision, whisper.device) == ("float16", "cuda:0")
    assert (action.language, action.task, action.params.num_beams) == ("korean", "transcribe", 5)


def test_whisper_loads_apart_from_the_clone_model(voice_clone: ComposeConfig):
    runtimes = {item.id: item.runtime.type.value for item in voice_clone.components}

    assert runtimes["whisper"] == "process"
    assert runtimes["qwen-clone"] != "process"


def _lock_entries(lock_path: Path) -> list[dict]:
    return tomllib.loads(lock_path.read_text(encoding="utf-8"))["package"]


def _locked_packages(lock_path: Path) -> dict[str, dict]:
    return {package["name"]: package for package in _lock_entries(lock_path)}


# 아키텍처마다 다른 CUDA 휠을 잠그면 같은 이름이 여러 번 나온다.
def _locked_versions(lock_path: Path) -> dict[str, frozenset[str]]:
    entries = _lock_entries(lock_path)
    names = {entry["name"] for entry in entries}
    return {name: frozenset(entry.get("version", "") for entry in entries if entry["name"] == name) for name in names}


def _without_cuda_tag(versions: frozenset[str]) -> frozenset[str]:
    return frozenset(version.split("+")[0] for version in versions)


def test_service_lock_keeps_the_spike_library_versions():
    spike = _locked_versions(SPIKE_DIR / "uv.lock")
    service = _locked_versions(VOICE_CLONE_DIR / "uv.lock")

    assert {name: _without_cuda_tag(service[name]) for name in SHARED_LIBRARIES} == {
        name: _without_cuda_tag(spike[name]) for name in SHARED_LIBRARIES
    }


def test_service_torch_is_cuda_tagged_for_each_gpu_machine():
    service = _locked_versions(VOICE_CLONE_DIR / "uv.lock")

    assert {version.split("+")[-1] for version in service["torch"]} == {"cu126", "cu130"}


def test_service_and_tests_use_the_same_fork_commit():
    def fork_source(lock_path: Path) -> str:
        return _locked_packages(lock_path)["model-compose"]["source"]["git"]

    assert fork_source(VOICE_CLONE_DIR / "uv.lock") == fork_source(SPIKE_DIR / "uv.lock")


def test_reference_ffmpeg_matches_the_spike_arguments(voice_clone: ComposeConfig):
    command = component(voice_clone, "reference-ffmpeg").actions[0].command

    assert command == ffmpeg_command(build_args(Path(SOURCE_PLACEHOLDER)), Path(OUTPUT_PLACEHOLDER))


def _workflow(config: ComposeConfig, workflow_id: str):
    return next(item for item in config.workflows if item.id == workflow_id)


def test_long_transcribe_cuts_speech_within_the_whisper_window(voice_clone: ComposeConfig):
    vad = component(voice_clone, "vad")
    action = vad.actions[0]

    assert (vad.family, action.sample_rate, action.streaming) == ("silero", 16000, False)
    assert action.params.max_speech_duration == f"{WHISPER_WINDOW_SEC}s"
    assert action.output == "${result.segments}"
    assert vad.runtime.type.value == "process"


def test_long_transcribe_reuses_the_short_whisper_and_streams_json(voice_clone: ComposeConfig):
    jobs = {job.id: job for job in _workflow(voice_clone, LONG_TRANSCRIBE_WORKFLOW).jobs}

    assert jobs["transcribe"].do.component == "whisper"
    assert jobs["transcribe"].output == "${output as stream/json}"
    assert jobs["clip"].input["spans"] == "${jobs.detect.output}"


def test_long_transcribe_keeps_whisper_mistakes_for_qc(voice_clone: ComposeConfig):
    assert all(item.type.value != "transcript-corrector" for item in voice_clone.components)


def test_service_locks_the_packages_the_vad_driver_installs():
    assert {"silero-vad", "soxr"} <= set(_locked_packages(VOICE_CLONE_DIR / "uv.lock"))


def test_clip_check_measures_only_after_transcription_has_finished_reading_the_upload(voice_clone: ComposeConfig):
    """두 단계가 업로드를 동시에 읽으면 늦은 쪽이 잘린 음성을 받고도 오류가 나지 않는다."""
    workflow = next(item for item in voice_clone.workflows if item.id == "check-clip")
    jobs = {job.id: job for job in workflow.jobs}

    assert [(job_id, job.component, job.depends_on) for job_id, job in jobs.items()] == [
        ("transcribe", "whisper", []), ("measure", "voice-measure", ["transcribe"]),
    ]
    assert all(job.input == {"audio_path": "${input.audio_path}"} for job in jobs.values())
    assert workflow.output == {"transcript": "${jobs.transcribe.output}", "measure": "${jobs.measure.output}"}


def test_clip_measure_feeds_the_upload_to_the_spike_cli_as_a_stream(voice_clone: ComposeConfig):
    action = component(voice_clone, "voice-measure").actions[0]

    assert action.command == ["spike-python-not-set", "-m", "spike.run_voice_measure"]
    assert action.stdin == "${input.audio_path as file}"
    assert action.output == "${result.stdout as json}"
