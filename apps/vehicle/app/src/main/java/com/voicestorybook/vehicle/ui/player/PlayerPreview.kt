package com.voicestorybook.vehicle.ui.player

import android.view.View
import android.widget.ImageButton
import android.widget.TextView
import com.voicestorybook.vehicle.R
import com.voicestorybook.vehicle.core.library.Story
import com.voicestorybook.vehicle.core.listening.ResumePoint
import com.voicestorybook.vehicle.core.playback.chapterProgressOf
import com.voicestorybook.vehicle.ui.bindCover

// 재생 화면 레이아웃(screen_player)을 플레이어 없이 이야기 데이터로만 채운다. 카운트다운 덮개 뒤에 깐다(Figma 73:1771).
// 플레이어를 건드리지 않으므로 듣던 이야기는 0이 될 때까지 그대로 나온다.
fun showPlayerPreview(root: View, story: Story, point: ResumePoint) {
    val chapters = story.chapters.sortedBy { it.index }
    val position = chapters.indexOfFirst { it.index == point.chapterIndex }.coerceAtLeast(0)
    val duration = chapters.getOrNull(position)?.asset?.durationMs ?: 0
    val context = root.context
    root.findViewById<TextView>(R.id.playerTitle).text = story.title
    root.findViewById<TextView>(R.id.playerVoice).text = voiceTagText(context, story.voiceLabel)
    showChapterLine(root.findViewById(R.id.playerChapterRow), position + 1, chapters.size, chapters.getOrNull(position)?.title)
    root.findViewById<ChapterProgressView>(R.id.playerProgress).show(chapterProgressOf(position, point.positionMs, duration, chapters.size))
    // 덮개 뒤 장식이라 실제 재생 상태와 상관없이 Figma(73:1771)처럼 "잠깐 멈춤" 모양을 그린다.
    root.findViewById<ImageButton>(R.id.playerToggle).setImageResource(R.drawable.ic_pause)
    root.findViewById<TextView>(R.id.playerToggleLabel).setText(R.string.player_pause)
    bindCover(root.findViewById(R.id.playerCover), story.storyId, playerCoverShape(context))
}
