package com.voicestorybook.vehicle.playback

import android.util.Log
import androidx.media3.common.Player
import com.voicestorybook.vehicle.core.playback.playChangeLogOf
import com.voicestorybook.vehicle.core.playback.suppressionLogOf

private const val TAG = "AudioFocus"

// 재생이 멈춘 이유와 일시 억제(통화·음성 명령) 이유를 남긴다. who는 이야기와 벨트 안내를 구분한다.
class FocusLog(private val who: String) : Player.Listener {
    override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
        Log.i(TAG, "$who ${playChangeLogOf(playWhenReady, playChangeCauseOf(reason))}")
    }

    override fun onPlaybackSuppressionReasonChanged(playbackSuppressionReason: Int) {
        Log.i(TAG, "$who ${suppressionLogOf(suppressionCauseOf(playbackSuppressionReason))}")
    }
}

// 통화·음성 명령·긴급음 중에는 포커스 요청이 거부되어 안내가 나오지 않는다. Media3는 거부되면 playWhenReady를 바로 false로 되돌린다.
fun logIfPromptRefused(prompt: Player) {
    if (!prompt.playWhenReady) Log.w(TAG, "prompt focus request refused")
}
