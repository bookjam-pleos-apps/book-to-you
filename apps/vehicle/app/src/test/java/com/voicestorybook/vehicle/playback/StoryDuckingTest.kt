package com.voicestorybook.vehicle.playback

import android.content.Context
import android.media.AudioManager
import android.os.Looper
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.Player
import androidx.media3.exoplayer.BaseRenderer
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.Renderer
import androidx.media3.exoplayer.RendererCapabilities
import androidx.test.core.app.ApplicationProvider
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

// 플레이어가 오디오 출력에 내려보내는 음량만 적어 두는 가짜 출력.
private class VolumeProbe(private val volumes: LinkedBlockingQueue<Float>) : BaseRenderer(C.TRACK_TYPE_AUDIO) {
    override fun getName() = "VolumeProbe"
    override fun render(positionUs: Long, elapsedRealtimeUs: Long) = Unit
    override fun isReady() = true
    override fun isEnded() = true
    override fun supportsFormat(format: Format) = RendererCapabilities.create(C.FORMAT_UNSUPPORTED_TYPE)
    override fun handleMessage(messageType: Int, message: Any?) {
        if (messageType == Renderer.MSG_SET_VOLUME) volumes.put(message as Float)
    }
}

// 내비 안내가 포커스를 MAY_DUCK으로 가져갈 때 앱이 받는 신호(LOSS_TRANSIENT_CAN_DUCK)에 대한 반응.
// 차가 이 신호를 실제로 보내는지는 여기서 확인하지 못한다(에뮬레이터는 보내지 않았다).
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class StoryDuckingTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val volumes = LinkedBlockingQueue<Float>()

    private fun playingPlayer(attributes: AudioAttributes): ExoPlayer {
        val player = ExoPlayer.Builder(context) { _, _, _, _, _ -> arrayOf(VolumeProbe(volumes)) }
            .setAudioAttributes(attributes, true)
            .build()
        player.prepare()
        player.play()
        return player
    }

    private fun sendDuckSignal() {
        val audio = context.getSystemService(AudioManager::class.java)
        val request = assertNotNull(shadowOf(audio).lastAudioFocusRequest)
        request.listener.onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK)
        shadowOf(Looper.getMainLooper()).idle()
    }

    private fun loweredVolume(): Float? =
        generateSequence { volumes.poll(2, TimeUnit.SECONDS) }.firstOrNull { it < 1f }

    @Test
    fun `the story keeps playing at a lower volume when it is asked to duck`() {
        val player = playingPlayer(STORY_AUDIO)
        sendDuckSignal()
        assertTrue(player.playWhenReady)
        assertEquals(Player.PLAYBACK_SUPPRESSION_REASON_NONE, player.playbackSuppressionReason)
        assertTrue(assertNotNull(loweredVolume()) < 1f)
        player.release()
    }

    @Test
    fun `the belt prompt, being speech, is held back instead of ducked`() {
        val player = playingPlayer(PROMPT_AUDIO)
        sendDuckSignal()
        assertEquals(Player.PLAYBACK_SUPPRESSION_REASON_TRANSIENT_AUDIO_FOCUS_LOSS, player.playbackSuppressionReason)
        player.release()
    }
}
