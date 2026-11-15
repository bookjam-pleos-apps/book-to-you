package com.voicestorybook.vehicle.playback

import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import com.voicestorybook.vehicle.adapter.store.HistoryStore
import com.voicestorybook.vehicle.core.listening.ListeningMark
import com.voicestorybook.vehicle.core.listening.recordProgress

private const val SAVE_EVERY_MS = 10_000L

// 이어 듣기 기록. 멈출 때, 챕터가 바뀔 때, 재생 중에는 10초마다 남긴다.
class ProgressRecorder(
    private val player: Player,
    private val history: HistoryStore,
    private val clock: () -> Long,
    private val isPaired: () -> Boolean,
) : Player.Listener {
    private val main = Handler(Looper.getMainLooper())
    private val periodicSave = object : Runnable {
        override fun run() {
            save()
            if (player.isPlaying) main.postDelayed(this, SAVE_EVERY_MS)
        }
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
        main.removeCallbacks(periodicSave)
        if (isPlaying) main.postDelayed(periodicSave, SAVE_EVERY_MS) else save()
    }

    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) = save()

    fun release() {
        main.removeCallbacks(periodicSave)
        save()
    }

    // 연결이 끊긴 뒤에는 남기지 않는다. 지운 기록이 되살아나지 않게 한다.
    private fun save() {
        if (!isPaired()) return
        val ref = chapterRefOf(player.currentMediaItem?.mediaId) ?: return
        val mark = ListeningMark(ref.renderId, ref.chapterIndex, player.currentPosition, clock())
        history.save(recordProgress(history.load(), mark))
    }
}
