# model-compose 서비스

모델 호출을 model-compose 워크플로우로 실행한다. 드라이버 확장이 필요해 `rn1njoo/model-compose` 포크를 커밋 SHA로 고정해 쓴다.

| 폴더 | 워크플로우 | 포트 |
|---|---|---|
| `voice-clone/` | `prepare-reference`, `clone-sentence`, `transcribe`, `check-clip`, `transcribe-long`, `render-unit`(+ 하위 `render-attempt`) | 18090 |
| `story-labeling/` | `style-tagging` | 18092 |
| `cover-focus/` | `locate-subjects`, `preview-crop`, `mark-subjects` (맥 전용, 차량 앱 표지 초점) | 18097 |

voice-clone과 story-labeling은 `transformers` 버전이 달라 환경을 나눈다. cover-focus는 맥에서만 도는 별도 환경이다. 같은 GPU에 동시에 올리지 않는다.

서버는 `127.0.0.1`에만 열리지만 인증이 없고 경로 입력을 검증하지 않는다. 검증할 때만 띄우고 끝나면 내린다.

## 실행

공유 DGX에서는 먼저 다른 프로세스를 확인한다. 있으면 실행 전에 사용자에게 묻는다.

```bash
nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader
```

서비스 환경을 만들고 띄운다. `--locked`로 lock과 어긋난 환경을 막는다.

```bash
cd gpu/compose/voice-clone
uv sync --locked
uv pip freeze > /tmp/freeze_before.txt
uv run --locked model-compose up
```

기동 뒤 `freeze`를 다시 받아 비교한다. torch에 `+cu` 태그가 없으면 드라이버가 다른 버전으로 재설치하므로, 차이가 있으면 결과를 믿지 않는다.

### RTX 4090에서 (제품 API의 전사·렌더)

GPU 0만 쓴다. GPU 0에는 상주 프로세스가 있어 `render-batch.sh`에 `--share-with <pid>`로 그 PID만 허용한다. 18090은 같은 장비의 다른 서비스가 쓰므로, 장비에 올린 사본의 포트만 바꾸고 맥에서 터널로 잇는다.

```bash
# 4090의 ~/voice-storybook-api/voice-clone. 포트는 SERVICE_PORT로 바꾼다(정의의 기본값 18090은 다른 서비스가 쓴다)
export CUDA_DEVICE_ORDER=PCI_BUS_ID CUDA_VISIBLE_DEVICES=0 SERVICE_PORT=18096
uv sync --locked && uv run --locked model-compose up
# 맥
ssh -fN -L 18090:127.0.0.1:18096 <4090 호스트>
```

- `HF_HUB_OFFLINE=1`로 띄우지 않는다. Qwen 드라이버가 기동 때 HF API로 모델 정보를 조회한다.
- 서비스를 내릴 때 whisper 워커 프로세스도 함께 내려갔는지 확인한다.

### DGX Spark에서 (제품 API의 전사, 웹의 폰 시험용)

공용 장비라 GPU와 통합 메모리를 vLLM, 다른 사람 컨테이너, 다른 클론 작업이 함께 쓴다. 18090·18091은 다른 사람이 쓰므로 장비에서는 18096으로 띄우고 맥에서 터널로 잇는다. 클론 실험용 `~/voice-storybook-clone`과 섞이지 않게 `~/voice-storybook-api/voice-clone`에 따로 둔다. Qwen과 whisper-large-v3는 `~/.cache/huggingface`에 이미 있다.

1. 먼저 본다. 아래 셋 중 하나라도 걸리면 띄우지 않는다.
   - `uptime`, `free -g`: 가용 메모리가 15GB 아래면 멈춘다. Qwen과 whisper를 합쳐 약 8GB를 잡는다.
   - `nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv`, `ps -u user -o pid,etime,args | grep -E "[v]oice-storybook"`: 클론 세션이 렌더 중인지 본다.
   - `ss -ltn | grep -E ":1809[0-9] "`: 18096을 이미 누가 쓰는지 본다.
2. 맥에서 이 저장소의 서비스 정의를 올리고 포트만 바꾼다. whisper를 별도 프로세스로 읽는 수정(`runtime: process`)이 들어간 사본이어야 한다.

   ```bash
   ssh "$DGX_HOST" 'mkdir -p ~/voice-storybook-api'
   rsync -a --exclude '.venv' gpu/compose/voice-clone/ "$DGX_HOST":voice-storybook-api/voice-clone/
   ```

3. DGX에 접속해 띄운다. `cd`를 먼저 끝내고 단독 명령으로 띄워야 ssh가 끝난다. 기동 전후 `freeze`를 비교해 torch가 `+cu130` 그대로인지 본다.

   ```bash
   ssh "$DGX_HOST"
   cd ~/voice-storybook-api/voice-clone
   export PATH="$HOME/.local/bin:$PATH"
   uv sync --locked && uv pip freeze > ~/voice-storybook-api/freeze_before.txt
   # render-unit과 check-clip의 shell 단계가 쓸 파이썬. spike 환경을 가리킨다(없으면 두 워크플로우만 멈추고, 녹음 확인은 재시도로 남는다).
   export SPIKE_PYTHON="$HOME/voice-storybook-api/spike/.venv/bin/python"
   # render-story가 묶음을 풀 곳과 render-unit을 부를 이 서비스 주소. 요청으로 받지 않는다(인증이 없다).
   export RENDER_JOBS_DIR="$HOME/voice-storybook-api/render-jobs"
   export RENDER_COMPOSE_URL="http://127.0.0.1:18096/api/workflows/runs"
   # 포트와 주소는 정의를 고치지 않고 환경변수로 준다. Qwen·whisper는 첫 요청에 올린다. 쉬는 동안 내리려면 QWEN_IDLE_TIMEOUT·WHISPER_IDLE_TIMEOUT(예: 5m)을 준다. 기본 0은 내리지 않는다.
   export SERVICE_PORT=18096
   nohup uv run --locked model-compose up > ~/voice-storybook-api/voice-clone.log 2>&1 < /dev/null &
   ```

4. 기동을 확인한다. 로그에 두 컴포넌트가 뜬 것, `ss -ltn`에 18096이 보여야 한다. 모델은 첫 요청 때 올라오므로 `nvidia-smi`의 프로세스는 그 뒤에 늘어난다. 시연 서버에 붙이는 상시 서비스는 `deploy/demo/README.md`의 "GPU 서비스"를 따른다.
5. 맥에서 잇는다. 맥의 18090이 비어 있어야 한다(`lsof -iTCP:18090 -sTCP:LISTEN`). API의 `COMPOSE_URL`은 기본값 `http://127.0.0.1:18090/api/workflows/runs` 그대로다.

   ```bash
   ssh -fN -L 18090:127.0.0.1:18096 "$DGX_HOST"
   curl -s -F workflow_id=transcribe -F output_only=true -F 'input[audio_path]=@<짧은 wav>;type=audio/wav' http://127.0.0.1:18090/api/workflows/runs
   ```

6. 내릴 때: 4번에서 적은 PID를 명령줄이 `voice-storybook-api/voice-clone/.venv`인지 확인한 뒤 PID로 직접 내린다. 부모만 내리면 whisper 자식이 남아 메모리를 잡는다. `pgrep -f`는 그 명령을 실행한 ssh 셸까지 잡으니 쓰지 않는다. 맥 터널도 PID로 내린다.

whisper 별도 프로세스 설정은 4090에서만 확인했다. DGX(aarch64, `cu130`)에서 이 설정으로 띄우는 것은 검증 안 됨이다.

## 스타일 태깅

RTX 4090 장비의 GPU 0에서 돌린다. DGX의 GB10은 vLLM과 메모리를 함께 쓴다. lock은 aarch64(`cu130`)와 x86_64(`cu126`, 드라이버 CUDA 12.9)를 함께 잠근다.

베이스 모델은 약 18GB, 병합본도 약 18GB다. 없으면 기동할 때 받고 만든다. 두 장비가 함께 쓰는 NAS(`/mnt/models`)에 고정한 revision의 베이스와 어댑터, 병합본이 이미 있어 다운로드와 병합 없이 쓴다. 모델 캐시는 읽기만 하고, 병합본은 서비스 폴더에서 심볼릭 링크로 가리킨다. 폴더를 지워도 공유 모델은 남는다.

```bash
ROOT=~/voice-storybook-labeling
# XDG_CACHE_HOME을 옮기면 HF 캐시도 따라가므로 HF_HOME을 고정한다.
export HF_HOME=~/.cache/huggingface HF_HUB_OFFLINE=1
export XDG_CACHE_HOME=$ROOT/.cache/xdg TMPDIR=$ROOT/.cache/tmp UV_CACHE_DIR=$ROOT/.cache/uv
# nvidia-smi의 번호와 맞추려면 순서를 고정해야 한다. 기본값은 빠른 GPU부터 센다.
export CUDA_DEVICE_ORDER=PCI_BUS_ID CUDA_VISIBLE_DEVICES=0
mkdir -p "$TMPDIR" "$XDG_CACHE_HOME/models/nimble-merged"
ADAPTER=bd792f44ec8e265be861bfcdf4e05967ffe0e858
ln -sfn /mnt/models/models/nimble-merged/$ADAPTER "$XDG_CACHE_HOME/models/nimble-merged/$ADAPTER-bfloat16"
cd $ROOT/story-labeling
uv sync --locked
uv pip freeze > "$ROOT/.cache/freeze_before.txt"
uv run --locked model-compose up
```

- `model-compose up`은 scorer를 바로 GPU에 올린다. 렌더나 측정이 돌고 있으면 띄우지 않는다.
- 기동 뒤 `freeze` 차이는 없어야 한다. nimble은 패키지 메타데이터 없이 복사되어 `freeze`에 나타나지 않으므로 `import nimble`으로 따로 확인한다.
- 병합본이 없어 새로 만들다 실패하면 `.cache/xdg/models/nimble-merged`를 지우고 다시 시작한다. 드라이버는 `config.json`이 있으면 병합이 끝난 것으로 본다.
- 맥에서는 `ssh -L 18092:127.0.0.1:18092 <4090 호스트>`로 연결한 뒤 `spike.run_tag_story --tagger nimble`, `spike.experiments.run_style_eval --nimble`을 실행한다.

## 직접 호출과 비교

서비스를 띄운 채 다른 셸에서 실행한다. 스파이크 코드는 비교할 때만 얹는다.

```bash
cd gpu/compose/voice-clone
uv run --locked --with-editable ../../spike \
  python -m spike.experiments.run_compose_parity --speaker p_sohee --sentences t01 --out outputs/compose_parity/gate
```

`--out`은 현재 폴더 기준이다. 리포트의 `passed`는 모든 문장이 끝나고 기준을 통과해야 참이다.

## 쓰는 범위

- Whisper 드라이버는 30초 창 하나만 듣는다. 클라이언트는 30초를 넘는 입력을 `transcribe-long`(Silero VAD로 30초 이하 구간을 나눠 구간마다 받아쓴다)으로 보내고 구간을 이어 붙인다. DGX에서 저장된 168단위를 다시 받아써 QC 판정이 모두 같았다(`spike.experiments.measure.run_transcription_rescore`).
- 제품 렌더는 기본으로 이 서비스를 쓴다(`render-batch.sh`의 기본 엔진 `qwen3-base-compose`, 비상 경로는 `--engine qwen3-base`). 렌더 프로세스는 torch 없이 돌고(`--no-dev --extra audio`), 서비스가 음성을 경로로 읽으므로 같은 장비에서 실행한다. 시작 전에 서비스에 `transcribe-long`이 있는지 확인한다.
- `render-unit`은 동화 단위 하나를 렌더한다. loop로 시도를 최대 3번 반복하고, 시도마다 `render-attempt`(클론 → 저장 → VAD → 구간 받아쓰기 → QC)를 돈다. 판단은 shell 단계가 `spike.run_render_step`을 불러 Python에서 한다. 작업 폴더는 서비스와 같은 장비에 있어야 하고, 단계의 파이썬은 서비스를 띄울 때 정한 `SPIKE_PYTHON`이다(요청으로 받지 않는다). 맥 CPU 스모크(가짜 클론, whisper-tiny)로 재시도·예산 초과·VAD 구간 경로를 확인했다. DGX에서 redhood 41단위와 fisherman 51단위를 `qwen3-base-compose`와 같은 작업 폴더로 렌더해 seed·시도 수·합격·받아쓰기·음성 샘플까지 모두 같았다(31.84초 단위 포함). 두 편 다 첫 시도에 모두 합격해 재시도 경로는 GPU에서 돌지 않았다.
- `check-clip`은 부모가 올린 녹음 하나를 확인한다. whisper로 받아쓴 뒤 shell 단계가 `spike.run_voice_measure`로 음높이 중앙값과 말한 시간을 재서 `{transcript, measure}`로 돌려준다. 판정(대본 일치, calm과 구별)은 API가 한다. 측정은 `run_reference_check`와 같은 pYIN이라 기준(`content/scripts/recording-scripts.json`의 `styleChecks`)을 정한 측정과 자가 같다. 두 단계는 차례로 돈다. 동시에 돌리면 업로드의 읽기 위치를 나눠 써서 측정이 잘린 음성을 받는다. 맥 CPU 스모크(whisper-tiny, multipart 업로드)에서 차례로 돌린 값이 단독 실행과 같았다. GPU 장비에서는 돌려 보지 않았다.
- `render-story`·`render-result`·`render-cleanup`은 맥 렌더 워커가 쓴다. `render-story`는 작업 폴더 묶음(tar: `job.json`, `reference-*.wav`)을 `RENDER_JOBS_DIR/<잡 id>`에 풀고 `spike.run_render_story`가 같은 프로세스 안에서 동화 한 편을 렌더한다(`qwen3-base-workflow`, 단위마다 `render-unit`). 잡 id는 소문자 UUID만, 묶음은 맨 위 일반 파일만 받는다. `wait_for_completion:false`로 걸고 `GET /api/tasks/<task_id>`로 조회한다. 결과는 `render-result`(`wait_for_completion:true`, `output_only:true`)로 `out.tar`(report.json, story.wav)를 받는다. 비동기 task로는 파일 출력을 받을 수 없다(포크 5bd4e1e6에서 `streaming`에 멈춤).
  - 컨트롤러 동시 실행은 3이다. 렌더 한 편이 슬롯 둘(`render-story`, 그 안의 `render-unit`)을 쓰고 남은 하나로 `check-clip`이 돈다. 모델 컴포넌트는 1이라 GPU에서 겹치지 않는다.
  - cancel(`POST /api/tasks/<id>/cancel?wait_for_completion=false`)은 shell 단계의 직속 자식에게만 SIGKILL을 보낸다. 그래서 렌더를 `sh -c`나 하위 프로세스로 돌리지 않는다. 이미 보낸 `render-unit` 하나는 끝까지 돈다. 대기열에 있던 task를 기다리며 cancel하면 `cancelling`에서 끝나지 않으니 `wait_for_completion=false`로 부른다.
  - task 상태는 메모리에만 있다. 끝난 task는 1시간 뒤, 서비스를 다시 띄우면 모두 사라진다. 결과는 작업 폴더에 남으므로 `render-result`로 확인한다.
- 체이닝, 다른 모델, `x_vector_only`는 거부한다.
- `gen_ms`는 HTTP와 프롬프트 생성을 포함해 직접 호출의 `speedX`와 비교할 수 없다.
- 끝나면 올린 실제 음성과 생성 클립을 지운다.
