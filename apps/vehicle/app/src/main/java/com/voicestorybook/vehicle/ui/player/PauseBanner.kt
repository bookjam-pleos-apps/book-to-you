package com.voicestorybook.vehicle.ui.player

import android.view.View
import android.widget.ImageView
import android.widget.TextView
import androidx.media3.common.Player
import com.voicestorybook.vehicle.R
import com.voicestorybook.vehicle.cabin.CabinGuard
import com.voicestorybook.vehicle.core.cabin.CabinEvent
import com.voicestorybook.vehicle.core.driving.limitText
import com.voicestorybook.vehicle.core.playback.shouldInterruptStory
import com.voicestorybook.vehicle.playback.storyPlaybackOf

// 04 배너. 벨트·뒷문으로 이야기가 멈췄을 때 이유를 보이고, 다시 재생하면 사라진다.
// 멈추는 일은 재생 서비스(SafetyInterrupter)가 한다. 컨트롤러 상태는 서비스보다 늦게 따라오므로,
// 이벤트가 온 순간 컨트롤러가 아직 재생 중이면 이 이벤트로 멈춘 것으로 본다(서비스와 같은 판정).
class PauseBanner(
    root: View,
    private val player: Player,
    private val cabinGuard: CabinGuard,
    private val textLimit: () -> Int?,
) {
    private val view: View = root.findViewById(R.id.playerBanner)
    private val icon: ImageView = root.findViewById(R.id.playerBannerIcon)
    private val text: TextView = root.findViewById(R.id.playerBannerText)
    private val onEvent: (CabinEvent) -> Unit = ::show

    init {
        cabinGuard.addListener(onEvent)
    }

    fun onPlaying(isPlaying: Boolean) {
        if (isPlaying) view.visibility = View.GONE
    }

    fun release() = cabinGuard.removeListener(onEvent)

    private fun show(event: CabinEvent) {
        if (!shouldInterruptStory(storyPlaybackOf(player))) return
        val (image, message) = contentOf(event)
        icon.setImageResource(image)
        text.text = limitText(text.context.getString(message), textLimit())
        view.visibility = View.VISIBLE
    }

    private fun contentOf(event: CabinEvent): Pair<Int, Int> = when (event) {
        is CabinEvent.BeltUnfastened -> R.drawable.ic_seatbelt to R.string.banner_belt
        is CabinEvent.DoorOpened -> R.drawable.ic_alert to R.string.banner_door
    }
}
