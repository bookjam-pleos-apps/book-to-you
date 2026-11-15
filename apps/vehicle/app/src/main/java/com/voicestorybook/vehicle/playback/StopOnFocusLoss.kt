package com.voicestorybook.vehicle.playback

import androidx.media3.common.Player
import com.voicestorybook.vehicle.core.playback.shouldStopAfterPause

// 다른 앱이 포커스를 가져가면 정지한다. 재생 목록과 위치는 남아, 다시 재생하면 Media3가 준비부터 해서 같은 자리에서 튼다.
class StopOnFocusLoss(private val player: Player) : Player.Listener {
    override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
        if (shouldStopAfterPause(playWhenReady, playChangeCauseOf(reason))) player.stop()
    }
}
