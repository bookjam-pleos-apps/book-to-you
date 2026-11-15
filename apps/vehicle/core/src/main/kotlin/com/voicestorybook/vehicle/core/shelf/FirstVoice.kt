package com.voicestorybook.vehicle.core.shelf

import com.voicestorybook.vehicle.core.library.Library
import com.voicestorybook.vehicle.core.library.Story
import com.voicestorybook.vehicle.core.listening.ListeningMark

// 책을 골랐을 때 처음 골라져 있는 목소리(v2 결정 4). 받아 둔 렌더 중에서만 고르고, 하나도 없으면 null이다.
// ① 이 이야기를 마지막으로 들은 목소리 → ② 대표 목소리 → ③ 가장 최근에 쓴 목소리 → ④ manifest 첫 렌더.
fun firstVoiceOf(book: Book, history: List<ListeningMark>, library: Library, cachedAudioIds: Set<String>): Story? {
    val candidates = playableRenders(book, cachedAudioIds)
    return lastHeardRender(candidates, history)
        ?: candidates.firstOrNull { library.defaultVoiceId != null && it.voiceId == library.defaultVoiceId }
        ?: recentVoiceRender(candidates, history, library)
        ?: candidates.firstOrNull()
}

// history는 최신 기록이 맨 앞이다.
private fun lastHeardRender(candidates: List<Story>, history: List<ListeningMark>): Story? =
    history.firstNotNullOfOrNull { mark -> candidates.firstOrNull { it.renderId == mark.renderId } }

private fun recentVoiceRender(candidates: List<Story>, history: List<ListeningMark>, library: Library): Story? {
    val recentVoice = history.firstNotNullOfOrNull { library.story(it.renderId)?.let(::voiceKeyOf) } ?: return null
    return candidates.firstOrNull { voiceKeyOf(it) == recentVoice }
}

// voiceId가 없는 옛 manifest는 목소리 이름으로 같은 목소리를 찾는다.
fun voiceKeyOf(story: Story): String = story.voiceId ?: story.voiceLabel
