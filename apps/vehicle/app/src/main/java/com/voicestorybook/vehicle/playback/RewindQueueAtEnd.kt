package com.voicestorybook.vehicle.playback

import androidx.media3.common.Player

// PLAN: 마지막 장까지 다 들었으면 처음부터. Media3는 끝난 뒤 재생 버튼을 받으면 마지막 장의 처음으로만 돌아가므로,
// 끝나는 순간 멈추고 마지막 이야기의 1장 처음으로 되감아 둔다(전체 재생 목록의 끝에서만 온다). 화면 버튼과 스티어링 버튼이 모두 이 상태에서 시작한다.
class RewindQueueAtEnd(private val player: Player) : Player.Listener {
    override fun onPlaybackStateChanged(playbackState: Int) {
        if (playbackState != Player.STATE_ENDED) return
        player.pause()
        val ids = (0 until player.mediaItemCount).map { player.getMediaItemAt(it).mediaId }
        player.seekTo(storyStartIndex(ids, player.currentMediaItemIndex), 0)
    }
}
