package com.voicestorybook.vehicle.ui.home

import android.view.View
import android.widget.TextView
import com.voicestorybook.vehicle.R
import com.voicestorybook.vehicle.core.driving.limitText
import com.voicestorybook.vehicle.core.listening.resumePoint
import com.voicestorybook.vehicle.playback.playlistPositionOf
import com.voicestorybook.vehicle.ui.bindCover
import com.voicestorybook.vehicle.ui.player.showChapterCount
import com.voicestorybook.vehicle.ui.windowCoverShape

// 홈 왼쪽 "이어서 듣기" 카드. 마지막으로 들은 이야기 하나를 보여 주고, 없으면 숨긴다.
// 차 안에서는 누를 곳이 클수록 좋아 버튼뿐 아니라 카드 어디를 눌러도 이어 듣는다. 잠기면 둘 다 꺼진다.
// 카드 탭은 손가락용 넓은 자리일 뿐이라 화면 읽기에는 버튼 하나만 보인다(같은 동작을 두 번 읽지 않게).
class ResumeCard(root: View, private val onPlay: (StoryRow) -> Unit) {
    private val card: View = root.findViewById(R.id.homeResume)
    private val play: View = card.findViewById(R.id.resumePlay)
    private var row: StoryRow? = null

    init {
        play.setOnClickListener { row?.let(onPlay) }
        card.setOnClickListener { row?.let(onPlay) }
        card.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    val story get() = row?.story

    fun show(next: StoryRow?, textLimit: Int?) {
        row = next
        card.visibility = if (next == null) View.GONE else View.VISIBLE
        if (next == null) return
        val context = card.context
        val coverShape = windowCoverShape(context, R.bool.resumeCoverLandscape)
        bindCover(card.findViewById(R.id.resumeCover), next.story.storyId, coverShape)
        card.findViewById<TextView>(R.id.resumeTitle).text = limitText(next.story.title, textLimit)
        card.findViewById<TextView>(R.id.resumeVoice).text =
            limitText(context.getString(R.string.player_voice, next.story.voiceLabel), textLimit)
        showChapterCount(card.findViewById(R.id.resumeCount), resumeChapterOf(next), next.story.chapters.size)
    }

    // 고르기가 잠겼거나 항목 수 제한이 0이면 이미 플레이어에 올라간 이야기만 연다.
    fun setPlayable(playable: Boolean) {
        play.isEnabled = playable && row?.ready == true
        card.isEnabled = play.isEnabled
        play.alpha = if (play.isEnabled) 1f else DIMMED_ALPHA
    }

    // 재생이 실제로 시작할 장을 보인다(장 끝 3초 안이면 다음 장, 다 들었으면 1장). MainActivity.play와 같은 규칙이다.
    private fun resumeChapterOf(row: StoryRow): Int =
        playlistPositionOf(row.story, resumePoint(row.story, row.mark).chapterIndex) + 1
}
