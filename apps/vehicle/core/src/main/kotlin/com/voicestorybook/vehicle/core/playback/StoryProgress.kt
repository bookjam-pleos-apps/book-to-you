package com.voicestorybook.vehicle.core.playback

// 재생 화면 장 구분 막대의 값. 지난 장은 꽉, 지금 장은 들은 만큼, 남은 장은 빈 칸이다.
// 장 번호와 장 안 비율을 그대로 들고 있어 칸 채움이 소수점 오차 없이 정확히 0 또는 1이 된다.
data class ChapterProgress(val chapterIndex: Int, val withinChapter: Float, val chapterCount: Int) {
    fun fillOf(cell: Int): Float = when {
        cell < chapterIndex -> 1f
        cell == chapterIndex -> withinChapter
        else -> 0f
    }
}

// 장 길이를 아직 모르면(준비 중, 음수) 지금 장은 0으로 본다. 위치가 길이를 넘으면 1로 묶는다.
fun chapterProgressOf(chapterIndex: Int, positionMs: Long, durationMs: Long, chapterCount: Int): ChapterProgress {
    if (chapterCount <= 0) return ChapterProgress(chapterIndex = 0, withinChapter = 0f, chapterCount = 0)
    val withinChapter = if (durationMs > 0) (positionMs.toFloat() / durationMs).coerceIn(0f, 1f) else 0f
    return ChapterProgress(chapterIndex.coerceIn(0, chapterCount - 1), withinChapter, chapterCount)
}
