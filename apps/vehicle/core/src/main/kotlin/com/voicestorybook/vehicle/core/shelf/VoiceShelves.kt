package com.voicestorybook.vehicle.core.shelf

import com.voicestorybook.vehicle.core.library.Story

// 목소리 한 명의 이야기 묶음. 차량 미디어 화면은 이것을 폴더(탭)로 보여 주고 그 안에 이야기를 둔다.
data class VoiceShelf(val key: String, val voiceLabel: String, val stories: List<Story>)

// 이야기와 목소리의 순서는 목록에 처음 나온 순서를 따른다.
fun voiceShelvesOf(stories: List<Story>): List<VoiceShelf> =
    stories.groupBy(::voiceKeyOf).map { (key, own) -> VoiceShelf(key, own.first().voiceLabel, own) }
