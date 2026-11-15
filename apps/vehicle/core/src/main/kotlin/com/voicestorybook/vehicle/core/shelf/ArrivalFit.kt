package com.voicestorybook.vehicle.core.shelf

// 내비 안내 중이면 도착 전에 끝나는 책을 책장 앞에 둔다. 남은 시간을 모르면(안내 없음, 내비 미탑재) 순서를 바꾸지 않는다.
// 책의 길이는 받아 둔 목소리 가운데 가장 짧은 것이다(어느 목소리로 들어도 끝나는지가 아니라 끝낼 수 있는지를 본다).
fun fitsBeforeArrival(book: Book, remainingMs: Long?, cachedAudioIds: Set<String>): Boolean {
    if (remainingMs == null || remainingMs <= 0) return false
    val shortest = shortestMs(book, cachedAudioIds) ?: return false
    return shortest <= remainingMs
}

private fun shortestMs(book: Book, cachedAudioIds: Set<String>): Long? =
    playableRenders(book, cachedAudioIds).minOfOrNull { it.durationMs }

// 도착 전에 끝나는 책 먼저, 그 안에서는 긴 책부터(남은 시간을 가장 많이 채운다). 나머지 책은 순서를 그대로 둔다.
fun arrivalFitFirst(books: List<Book>, remainingMs: Long?, cachedAudioIds: Set<String>): List<Book> {
    val (fitting, others) = books.partition { fitsBeforeArrival(it, remainingMs, cachedAudioIds) }
    return fitting.sortedByDescending { shortestMs(it, cachedAudioIds) } + others
}

// 내비 목적지 정보(남은 시간 초, 남은 거리 m)를 남은 시간으로 바꾼다. 경로가 없으면 내비가 0을 주므로 null로 본다.
fun remainingMsOf(remainTimeSec: Int, remainDistanceM: Int): Long? =
    if (remainTimeSec <= 0 || remainDistanceM <= 0) null else remainTimeSec * 1000L
