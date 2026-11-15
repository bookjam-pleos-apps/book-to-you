from spike.remote_queue.queue_plan import QueueStep
from spike.experiments.run_queue import QueueFolder, step_runner


def test_folder_remembers_finished_steps_and_keeps_progress(tmp_path):
    folder = QueueFolder(tmp_path)
    assert not folder.is_done("a")
    folder.mark_done("a")
    folder.report("DONE a")
    assert folder.is_done("a")
    assert (tmp_path / "progress.log").read_text(encoding="utf-8").strip().endswith("DONE a")


def test_folder_keeps_the_queue_pid_only_while_running(tmp_path):
    folder = QueueFolder(tmp_path)
    folder.record_pid(4321)
    assert (tmp_path / "queue.pid").read_text(encoding="utf-8") == "4321"
    folder.clear_pid()
    folder.clear_pid()
    assert not (tmp_path / "queue.pid").exists()


def test_step_runs_in_a_new_process_with_its_own_log(tmp_path):
    execute = step_runner(tmp_path, gpu=1)
    assert execute(QueueStep("ok", "spike.clone.cli_output", ()))
    assert not execute(QueueStep("missing", "spike.no_such_module", ()))
    assert "No module named" in (tmp_path / "missing.log").read_text(encoding="utf-8")
