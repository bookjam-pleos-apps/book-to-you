package com.voicestorybook.vehicle.ui.player

import android.content.Context
import android.view.View
import android.widget.TextView
import com.voicestorybook.vehicle.R
import com.voicestorybook.vehicle.core.playback.showsChapterCount
import com.voicestorybook.vehicle.core.playback.showsChapterLine

// 재생 화면의 목소리 태그·장 태그. 재생 화면, 카운트다운 덮개 뒤 미리 보기, 이어서 듣기 카드가 같은 표기를 쓴다.
fun voiceTagText(context: Context, voiceLabel: String): String = context.getString(R.string.player_voice, voiceLabel)

// "n / m" 태그. 한 장짜리 이야기는 태그를 숨긴다.
fun showChapterCount(count: TextView, current: Int, total: Int) {
    count.visibility = if (showsChapterCount(total)) View.VISIBLE else View.GONE
    count.text = count.context.getString(R.string.player_progress, total, current)
}

// 장 줄("제n장. 제목" + "n / m" 태그). 제목이 없으면 "제n장"만 쓴다. 줄이 통째로 숨으면 여백도 함께 빠진다.
fun showChapterLine(row: View, current: Int, total: Int, chapterTitle: String?) {
    row.visibility = if (showsChapterLine(chapterTitle, total)) View.VISIBLE else View.GONE
    val chapter = row.findViewById<TextView>(R.id.playerChapter)
    chapter.text = chapterTitle?.let { chapter.context.getString(R.string.player_chapter_titled, current, it) }
        ?: chapter.context.getString(R.string.player_chapter, current)
    showChapterCount(row.findViewById(R.id.playerCount), current, total)
}
