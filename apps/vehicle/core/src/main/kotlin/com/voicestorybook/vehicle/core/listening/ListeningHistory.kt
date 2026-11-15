package com.voicestorybook.vehicle.core.listening

import com.voicestorybook.vehicle.core.library.Library
import com.voicestorybook.vehicle.core.library.Story

data class ListeningMark(
    val renderId: String,
    val chapterIndex: Int,
    val positionMs: Long,
    val updatedAtMs: Long,
)

data class ResumePoint(val chapterIndex: Int, val positionMs: Long)

data class RecentStory(val story: Story, val mark: ListeningMark)

const val HISTORY_LIMIT = 20

// 최신 기록이 맨 앞. 같은 렌더의 이전 기록은 대체한다.
fun recordProgress(history: List<ListeningMark>, mark: ListeningMark): List<ListeningMark> =
    (listOf(mark) + history.filterNot { it.renderId == mark.renderId }).take(HISTORY_LIMIT)

fun recentStories(history: List<ListeningMark>, library: Library, limit: Int): List<RecentStory> =
    history.mapNotNull { mark -> library.story(mark.renderId)?.let { RecentStory(it, mark) } }.take(limit)

// 첫 화면의 짧은 목록: 최근 들은 이야기를 빼고 manifest 순서대로.
fun otherStories(history: List<ListeningMark>, library: Library, recentLimit: Int): List<Story> {
    val recentIds = recentStories(history, library, recentLimit).map { it.story.renderId }.toSet()
    return library.stories.filterNot { it.renderId in recentIds }
}

// 주행 중 목록이 잘릴 때의 순서: 최근 들은 이야기가 앞, 나머지는 manifest 순서.
fun recentFirst(history: List<ListeningMark>, library: Library): List<Story> =
    recentStories(history, library, HISTORY_LIMIT).map { it.story } + otherStories(history, library, HISTORY_LIMIT)

fun forgetMissing(history: List<ListeningMark>, library: Library): List<ListeningMark> =
    history.filter { library.story(it.renderId) != null }

// 장 끝 이 시간 안에서 멈췄으면 그 장은 다 들은 것으로 본다(끝의 무음 때문에 바로 넘어가는 것을 막는다).
const val CHAPTER_DONE_WITHIN_MS = 3_000L

// 중간에서 멈췄으면 끊긴 문장을 다시 듣도록 조금 앞에서 시작한다.
const val RESUME_REWIND_MS = 5_000L

// 이 렌더를 마지막으로 멈춘 곳에서 이어 들을 위치. 기록이 없으면 처음이다.
fun resumePointIn(history: List<ListeningMark>, story: Story): ResumePoint =
    resumePoint(story, history.firstOrNull { it.renderId == story.renderId })

fun resumePoint(story: Story, mark: ListeningMark?): ResumePoint {
    val chapters = story.chapters.sortedBy { it.index }
    val start = ResumePoint(chapters.firstOrNull()?.index ?: 0, 0)
    if (mark == null) return start
    val position = chapters.indexOfFirst { it.index == mark.chapterIndex }
    if (position < 0) return start
    val chapter = chapters[position]
    val done = mark.positionMs >= chapter.asset.durationMs - CHAPTER_DONE_WITHIN_MS
    if (!done) return ResumePoint(chapter.index, (mark.positionMs - RESUME_REWIND_MS).coerceAtLeast(0))
    val next = chapters.getOrNull(position + 1) ?: return start
    return ResumePoint(next.index, 0)
}
