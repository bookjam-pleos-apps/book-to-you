package com.voicestorybook.vehicle.core.start

import com.voicestorybook.vehicle.core.library.Story
import com.voicestorybook.vehicle.core.shelf.Book
import com.voicestorybook.vehicle.core.shelf.hasVoiceChoice

// 책장에서 책을 눌렀을 때 할 일. "이어서 듣기"는 이 판정을 거치지 않고 바로 재생한다(v2 결정 1).
sealed interface BookStart {
    // 이 책의 목소리 하나가 이미 플레이어에 올라가 있고 바꿀 목소리가 없거나 주행 중이다. 다시 올리면 재생이 끊기므로 화면만 연다.
    data object ShowPlayer : BookStart
    data class PlayNow(val story: Story) : BookStart
    data class Countdown(val book: Book, val first: Story) : BookStart
}

// 카운트다운은 정차(P 기어) 중에만 띄운다. 공회전·주행·상태 모름은 바로 재생한다.
// Pleos: 주행 중에는 1초마다 바뀌는 숫자와 저절로 넘어가는 화면을 피하고, 목소리 바꾸기도 정차 중에만 연다.
// 듣고 있는 책도 정차 중이고 목소리가 여럿이면 카운트다운으로 목소리를 바꿀 수 있다. 처음에는 듣던 목소리가 골라져 있다.
fun bookStartOf(book: Book, first: Story, loadedRenderId: String?, parked: Boolean): BookStart {
    val loaded = book.renders.firstOrNull { it.renderId == loadedRenderId }
    if (loaded != null && (!parked || !hasVoiceChoice(book))) return BookStart.ShowPlayer
    if (!parked) return BookStart.PlayNow(first)
    return BookStart.Countdown(book, loaded ?: first)
}
