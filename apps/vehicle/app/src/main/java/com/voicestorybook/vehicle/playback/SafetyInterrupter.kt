package com.voicestorybook.vehicle.playback

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.source.SilenceMediaSource
import com.voicestorybook.vehicle.core.cabin.CabinEvent
import com.voicestorybook.vehicle.core.playback.shouldInterruptStory
import java.io.File

// 벨트가 풀리거나 뒷문이 열리면 이야기를 멈춘다. 벨트는 부모가 녹음한 안내를 이어서 튼다.
// 이야기는 자동으로 다시 시작하지 않는다. 부모가 스티어링 버튼이나 화면으로 다시 튼다.
// Pleos 안내 음성 가이드: 녹음 음원 기반 안내 멘트 앞에 무음(preroll)을 둔다. 출력 경로가 깨어나는 동안 첫 음절이 잘리지 않게 한다.
// 서버는 렌더 앞 무음을 50 ms 이하로 잘라 두므로 차량에서 붙인다. 가이드 권장 150~200 ms의 가운데 값.
private const val PROMPT_PREROLL_US = 180_000L

// 무음 앞머리(SilenceMediaSource)와 파일 소스는 media3의 불안정 API다. 버전을 올릴 때 이 클래스를 다시 확인한다.
@OptIn(UnstableApi::class)
class SafetyInterrupter(
    context: Context,
    private val story: Player,
    private val beltPromptFile: (renderId: String?) -> File?,
) {
    private val promptPlayer = ExoPlayer.Builder(context).setAudioAttributes(PROMPT_AUDIO, true).build().also {
        it.addListener(StopWhenEnded(it))
        it.addListener(FocusLog("prompt"))
    }
    private val promptSources = ProgressiveMediaSource.Factory(DefaultDataSource.Factory(context))

    fun onEvent(event: CabinEvent) {
        if (!shouldInterruptStory(storyPlaybackOf(story))) return
        story.pause()
        Log.i(TAG, "paused by $event")
        if (event is CabinEvent.BeltUnfastened) playPrompt()
    }

    fun release() = promptPlayer.release()

    private fun playPrompt() {
        val file = beltPromptFile(chapterRefOf(story.currentMediaItem?.mediaId)?.renderId)
        if (file == null) {
            Log.w(TAG, "no parent prompt cached")
            return
        }
        Log.i(TAG, "belt prompt ${file.nameWithoutExtension}")
        val recorded = promptSources.createMediaSource(MediaItem.fromUri(Uri.fromFile(file)))
        promptPlayer.setMediaSources(listOf(SilenceMediaSource(PROMPT_PREROLL_US), recorded))
        promptPlayer.prepare()
        promptPlayer.play()
        logIfPromptRefused(promptPlayer)
    }

    private companion object {
        const val TAG = "SafetyInterrupter"
    }
}

// Media3는 끝난 뒤에도 playWhenReady가 true면 오디오 포커스를 쥐고 있다. 안내가 끝나면 놓아 다른 앱 소리를 막지 않는다.
private class StopWhenEnded(private val player: Player) : Player.Listener {
    override fun onPlaybackStateChanged(playbackState: Int) {
        if (playbackState == Player.STATE_ENDED) player.stop()
    }
}
