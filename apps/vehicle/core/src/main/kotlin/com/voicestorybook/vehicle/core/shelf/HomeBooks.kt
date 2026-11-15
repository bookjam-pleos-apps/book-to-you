package com.voicestorybook.vehicle.core.shelf

import com.voicestorybook.vehicle.core.driving.StoryBrowsing
import com.voicestorybook.vehicle.core.library.Library
import com.voicestorybook.vehicle.core.library.Story
import com.voicestorybook.vehicle.core.listening.ListeningMark
import com.voicestorybook.vehicle.core.listening.recentFirst

// 홈 "내 책장"에 그릴 책. truncated면 목록 끝에 "차를 세우면" 안내를 보이고, resumeOpen이면 이어서 듣기 카드로 새 이야기도 연다.
data class HomeBooks(val books: List<Book>, val truncated: Boolean, val resumeOpen: Boolean)

// 홈을 그릴 때의 입력. resume은 이어서 듣기 카드에 보일 이야기, cachedAudioIds는 받아 둔 오디오다.
data class HomeInput(
    val library: Library,
    val history: List<ListeningMark>,
    val resume: Story?,
    val cachedAudioIds: Set<String>,
    // 내비가 알려 준 도착까지 남은 시간. 안내 중이 아니면 null(arrivalFitFirst).
    val remainingMs: Long? = null,
)

// 내 책장은 한 단 목록이라 허용 깊이와 상관없다. 항목 수 제한이 오면 이어서 듣기 카드를 먼저 한 개로 세고
// (사용자 위임, 엄격한 쪽), 남은 수만큼 책을 보인다.
fun homeBooksOf(input: HomeInput, browsing: StoryBrowsing): HomeBooks {
    if (browsing !is StoryBrowsing.Limited) return HomeBooks(arrivalFirst(input, booksOf(input.library.stories)), false, browsing == StoryBrowsing.Open)
    val candidates = arrivalFirst(input, limitedCandidates(input))
    val kept = candidates.take((browsing.maxItems - if (input.resume != null) 1 else 0).coerceAtLeast(0))
    return HomeBooks(kept, kept.size < candidates.size, browsing.maxItems >= 1)
}

// 제한된 칸에 넣을 순서. 카드에 이미 보이는 이야기는 목소리와 상관없이 빼고, 받아 둔 책을 먼저 둔다
// (같은 묶음 안에서는 최근 들은 순서).
private fun limitedCandidates(input: HomeInput): List<Book> =
    booksOf(recentFirst(input.history, input.library))
        .filterNot { it.storyId == input.resume?.storyId }
        .sortedBy { !isReady(it, input.cachedAudioIds) }

private fun arrivalFirst(input: HomeInput, books: List<Book>): List<Book> = arrivalFitFirst(books, input.remainingMs, input.cachedAudioIds)
