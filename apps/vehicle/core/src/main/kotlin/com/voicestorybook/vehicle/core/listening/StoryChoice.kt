package com.voicestorybook.vehicle.core.listening

import com.voicestorybook.vehicle.core.library.Story

sealed interface StoryChoice {
    // 플레이어에 이미 올라간 이야기다. 다시 올리면 재생이 끊기고 낡은 위치로 돌아가므로 화면만 연다.
    data object ShowPlayer : StoryChoice
    data class Start(val point: ResumePoint) : StoryChoice
}

// 목록에서 이야기를 눌렀을 때. history는 누르는 순간 저장소에서 읽은 값이어야 한다(화면을 그린 시점의 값은 낡는다).
fun chooseStoryStart(story: Story, loadedRenderId: String?, history: List<ListeningMark>): StoryChoice {
    if (story.renderId == loadedRenderId) return StoryChoice.ShowPlayer
    return StoryChoice.Start(resumePointIn(history, story))
}
