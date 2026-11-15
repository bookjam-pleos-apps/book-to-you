package com.voicestorybook.vehicle.core.listening

import com.voicestorybook.vehicle.core.library.Story

// 음성 비서(Gleo)의 "빨간 모자 틀어줘" 같은 검색어로 이야기를 찾는다. 띄어쓰기·문장부호·대소문자는 무시하고,
// 검색어 안에 제목이 들어 있거나 제목 안에 검색어가 들어 있으면 고른다. 빈 검색어("동화 틀어줘")는 모든 이야기다.
private const val MIN_PARTIAL_QUERY = 2

fun searchStories(stories: List<Story>, query: String): List<Story> {
    val wanted = normalized(query)
    if (wanted.isEmpty()) return stories
    return stories.filter { story ->
        val title = normalized(story.title)
        title.isNotEmpty() && (title in wanted || (wanted.length >= MIN_PARTIAL_QUERY && wanted in title))
    }
}

private fun normalized(text: String): String = text.filter(Char::isLetterOrDigit).lowercase()

// 음성 요청으로 틀 이야기 하나. 제목이 없으면("동화 틀어줘") 가장 최근에 들은 이야기, 그것도 없으면 첫 이야기다.
fun storyForVoiceRequest(playable: List<Story>, recentRenderId: String?, query: String): Story? {
    if (query.isBlank()) return playable.firstOrNull { it.renderId == recentRenderId } ?: playable.firstOrNull()
    return searchStories(playable, query).firstOrNull()
}
