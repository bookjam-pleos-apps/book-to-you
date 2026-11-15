package com.voicestorybook.vehicle.core.shelf

import com.voicestorybook.vehicle.core.library.Story
import com.voicestorybook.vehicle.core.library.isPlayable

// 같은 이야기(storyId)를 목소리별 렌더로 모은 책 한 권. renders는 manifest 순서다.
data class Book(val storyId: String, val title: String, val renders: List<Story>)

// 책은 이야기가 처음 나온 순서를 따른다. 서버가 대표 목소리 → 목소리 이름 순으로 보내므로 그 순서가 이어진다.
fun booksOf(stories: List<Story>): List<Book> =
    stories.groupBy { it.storyId }.values.map { renders -> Book(renders.first().storyId, renders.first().title, renders) }

// 받아 둔 목소리가 하나라도 있으면 그 책을 들을 수 있다.
fun playableRenders(book: Book, cachedAudioIds: Set<String>): List<Story> =
    book.renders.filter { isPlayable(it, cachedAudioIds) }

fun isReady(book: Book, cachedAudioIds: Set<String>): Boolean = playableRenders(book, cachedAudioIds).isNotEmpty()

// 목소리 고르기는 목소리가 둘 이상인 이야기에만 보인다(v2 결정 3).
fun hasVoiceChoice(book: Book): Boolean = book.renders.size > 1
