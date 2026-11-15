package com.voicestorybook.vehicle.core.listening

import com.voicestorybook.vehicle.core.library.Library
import com.voicestorybook.vehicle.core.library.Story
import com.voicestorybook.vehicle.core.library.isPlayable

// 전체 재생 순서: 고른 이야기부터 같은 목소리의 다음 이야기들까지(서재 순서, 받아 둔 것만, 처음으로 돌아가지 않음).
// 마지막 장에서 "다음"을 누르거나 이야기가 끝나면 다음 이야기로 넘어간다. 고른 이야기는 늘 맨 앞이다.
// 목소리를 모르는 이야기는 다른 이야기와 묶지 않고 혼자 튼다.
fun playAllStories(library: Library, start: Story, cachedIds: Set<String>): List<Story> {
    if (start.voiceId == null) return listOf(start)
    val sameVoice = library.stories.filter { it.voiceId == start.voiceId }
    val startAt = sameVoice.indexOfFirst { it.renderId == start.renderId }
    if (startAt < 0) return listOf(start)
    val following = sameVoice.drop(startAt + 1).filter { isPlayable(it, cachedIds) }
    return listOf(start) + following
}
