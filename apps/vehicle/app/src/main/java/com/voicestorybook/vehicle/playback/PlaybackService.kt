package com.voicestorybook.vehicle.playback

import android.content.Intent
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import com.voicestorybook.vehicle.R
import com.voicestorybook.vehicle.cabin.CabinMonitor
import com.voicestorybook.vehicle.core.cabin.CabinEvent
import com.voicestorybook.vehicle.graph
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

// 스티어링 버튼(미디어 키)은 MediaSession이 받아 플레이어로 넘긴다. 주행 중 조작은 이 경로만 쓴다.
// MediaLibraryService(=MediaBrowserService)라 차량 미디어 카드·미디어 센터에도 잡힌다(Pleos Music/Audio 가이드 MBS 필수).
class PlaybackService : MediaLibraryService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var player: ExoPlayer
    private lateinit var session: MediaLibrarySession
    private lateinit var recorder: ProgressRecorder
    private lateinit var interrupter: SafetyInterrupter
    private lateinit var cabin: CabinMonitor
    private val onCabinEvent: (CabinEvent) -> Unit = { interrupter.onEvent(it) }

    override fun onCreate() {
        super.onCreate()
        player = ExoPlayer.Builder(this)
            .setAudioAttributes(STORY_AUDIO, true)
            .setHandleAudioBecomingNoisy(true)
            .build()
        graph.library.restoreIfNotLoaded()
        val library = StoryLibraryCallback(packageName, { graph.library.library }, graph.audio, graph.history::load) { getString(R.string.player_voice, it) }
        session = MediaLibrarySession.Builder(this, player, library).build()
        player.addListener(RewindQueueAtEnd(player))
        player.addListener(StopOnFocusLoss(player))
        player.addListener(FocusLog("story"))
        recorder = ProgressRecorder(player, graph.history, System::currentTimeMillis, graph.session::isPaired).also(player::addListener)
        interrupter = SafetyInterrupter(this, player) { renderId -> beltPromptFile(graph.library.library, graph.audio, renderId) }
        graph.cabinGuard.addListener(onCabinEvent)
        cabin = CabinMonitor(this, graph.cabinGuard).also { it.start() }
        stopWhenUnpaired()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession = session

    // Media3 기본 구현은 재생 중이면 서비스를 남겨, 최근 앱에서 지워도 소리가 계속 난다(Pleos Music/Audio 가이드: 종료 시 재생 정리).
    override fun onTaskRemoved(rootIntent: Intent?) {
        stopMedia()
        stopSelf()
        super.onTaskRemoved(rootIntent)
    }

    // pause가 이어 듣기 위치를 남기고(ProgressRecorder), stop이 오디오 포커스를 놓는다.
    private fun stopMedia() {
        player.pause()
        player.stop()
    }

    override fun onDestroy() {
        scope.cancel()
        graph.cabinGuard.removeListener(onCabinEvent)
        cabin.stop()
        recorder.release()
        interrupter.release()
        session.release()
        player.release()
        super.onDestroy()
    }

    // 부모가 기기 연결을 끊으면 지워질 파일을 더 재생하지 않는다.
    private fun stopWhenUnpaired() = scope.launch {
        graph.session.paired.collect { paired ->
            if (paired) return@collect
            player.stop()
            player.clearMediaItems()
        }
    }
}
