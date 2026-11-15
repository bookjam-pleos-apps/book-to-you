package com.voicestorybook.vehicle.ui.player

import android.view.View
import android.widget.ImageButton
import android.widget.TextView
import androidx.media3.common.Player
import com.voicestorybook.vehicle.R
import com.voicestorybook.vehicle.cabin.CabinGuard
import com.voicestorybook.vehicle.core.driving.DrivingRestriction
import com.voicestorybook.vehicle.core.driving.limitText
import com.voicestorybook.vehicle.core.driving.textLimitOf
import com.voicestorybook.vehicle.core.playback.ToggleAction
import com.voicestorybook.vehicle.core.playback.chapterProgressOf
import com.voicestorybook.vehicle.core.playback.toggleActionOf
import com.voicestorybook.vehicle.playback.chapterRefOf
import com.voicestorybook.vehicle.playback.storyIdOf
import com.voicestorybook.vehicle.playback.storyPlaybackOf
import com.voicestorybook.vehicle.ui.ParkedOnlyAction
import com.voicestorybook.vehicle.ui.Screen
import com.voicestorybook.vehicle.ui.bindCover
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

// 재생 중 진행 막대를 다시 그리는 간격. 주행 중 "반복적으로 움직이는 요소 지양"(Pleos)에 맞는 간격인지는 확인 필요.
private const val PROGRESS_TICK_MS = 1_000L

// 03 재생. 주행 중에도 보이는 화면이라 1~2초에 읽을 정보(제목, 몇 장째, 재생 상태)와 큰 버튼만 둔다.
class PlayerScreen(
    private val root: View,
    private val player: Player,
    cabinGuard: CabinGuard,
    private val restriction: StateFlow<DrivingRestriction>,
    private val scope: CoroutineScope,
    sendReport: SendReport,
    onBack: () -> Unit,
) : Screen {
    private val title: TextView = root.findViewById(R.id.playerTitle)
    private val voice: TextView = root.findViewById(R.id.playerVoice)
    private val chapterRow: View = root.findViewById(R.id.playerChapterRow)
    private val progress: ChapterProgressView = root.findViewById(R.id.playerProgress)
    private val toggle: ImageButton = root.findViewById(R.id.playerToggle)
    private val toggleLabel: TextView = root.findViewById(R.id.playerToggleLabel)
    private val report: ParkedOnlyAction = ParkedOnlyAction(root.findViewById(R.id.playerReport)) { reportFlow.open() }
    private val reportFlow: ReportFlow = ReportFlow(scope, ::currentRenderId, sendReport, player::pause, DialogReportPrompt(root.context, report))
    private val banner = PauseBanner(root, player, cabinGuard) { textLimitOf(restriction.value) }
    private val debug = CabinDebugPanel(root, cabinGuard, scope)
    private var progressTicker: Job? = null
    private var watchingLimit: Job? = null
    private val listener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) = render()
    }

    init {
        root.findViewById<View>(R.id.playerBack).setOnClickListener { onBack() }
        toggle.setOnClickListener { applyToggle() }
        root.findViewById<View>(R.id.playerPrevious).setOnClickListener { player.seekToPreviousMediaItem() }
        root.findViewById<View>(R.id.playerNext).setOnClickListener { player.seekToNextMediaItem() }
        debug.bind()
        player.addListener(listener)
        // 처음 한 번 그리고, 주행 중 문자열 길이 제한이 바뀌면 제목을 다시 그린다.
        watchingLimit = scope.launch { restriction.collect { render() } }
    }

    // 재생 화면의 큰 버튼은 주행 중에도 쓴다(Pleos 주행 중 허용 조작). 신고와 벨트 시험 토글만 정차 중에 연다.
    override fun setParked(parked: Boolean) {
        if (!parked) reportFlow.cancel()
        report.setParked(parked)
        debug.setParked(parked)
    }

    override fun release() {
        reportFlow.cancel()
        report.dismiss()
        banner.release()
        debug.release()
        progressTicker?.cancel()
        watchingLimit?.cancel()
        player.removeListener(listener)
    }

    private fun currentRenderId(): String? = chapterRefOf(player.currentMediaItem?.mediaId)?.renderId

    private fun render() {
        val metadata = player.mediaMetadata
        val limit = textLimitOf(restriction.value)
        title.text = limitText(metadata.title?.toString().orEmpty(), limit)
        voice.text = limitText(voiceTagText(root.context, metadata.artist?.toString().orEmpty()), limit)
        val chapterTitle = metadata.subtitle?.toString()?.let { limitText(it, limit) }
        showChapter(current = chapterNumber(), total = chapterCount(), chapterTitle)
        bindCover(root.findViewById(R.id.playerCover), storyIdOf(metadata), playerCoverShape(root.context))
        showToggle(toggleActionOf(storyPlaybackOf(player)))
        banner.onPlaying(player.isPlaying)
        followProgress(player.isPlaying)
    }

    private fun showChapter(current: Int, total: Int, chapterTitle: String?) {
        showChapterLine(chapterRow, current, total, chapterTitle)
        showProgress()
    }

    private fun showProgress() {
        progress.show(chapterProgressOf(chapterNumber() - 1, player.currentPosition, player.duration, chapterCount()))
    }

    // 전체 재생 목록은 여러 이야기를 잇는다. 장 번호와 장 수는 목록 위치가 아니라 지금 이야기 안의 값(미디어 정보)을 쓴다.
    private fun chapterNumber(): Int = player.mediaMetadata.trackNumber ?: (player.currentMediaItemIndex + 1)

    private fun chapterCount(): Int = player.mediaMetadata.totalTrackCount ?: player.mediaItemCount

    // 재생 중에만 막대를 따라 그린다. 멈추면 마지막 위치에 둔다.
    private fun followProgress(playing: Boolean) {
        if (!playing) {
            progressTicker?.cancel()
            progressTicker = null
            return
        }
        if (progressTicker?.isActive == true) return
        progressTicker = scope.launch {
            while (isActive) {
                delay(PROGRESS_TICK_MS)
                showProgress()
            }
        }
    }

    // 아이콘은 지금 누르면 할 일, 라벨도 같은 일을 글자로 보인다(A2: 라벨과 동작이 어긋나지 않게).
    private fun showToggle(action: ToggleAction) {
        val (icon, label) = when (action) {
            ToggleAction.Pause -> R.drawable.ic_pause to R.string.player_pause
            ToggleAction.Play -> R.drawable.ic_play to R.string.player_play
        }
        toggle.setImageResource(icon)
        toggle.contentDescription = root.context.getString(label)
        toggleLabel.setText(label)
    }

    private fun applyToggle() = when (toggleActionOf(storyPlaybackOf(player))) {
        ToggleAction.Pause -> player.pause()
        ToggleAction.Play -> player.play()
    }
}
