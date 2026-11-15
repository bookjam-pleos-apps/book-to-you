package com.voicestorybook.vehicle.core.shelf

import com.voicestorybook.vehicle.core.library.Story
import kotlin.test.Test
import kotlin.test.assertEquals

class VoiceShelvesTest {
    private val momRedhood = Story("r1", "redhood", "빨간 모자", "엄마", emptyList(), "mom")
    private val dadFisherman = Story("r2", "fisherman", "어부와 욕심많은 아내", "아빠", emptyList(), "dad")
    private val momMaster = Story("r3", "masteraway", "주인님이 집을 비운 사이", "엄마", emptyList(), "mom")

    @Test
    fun `stories are grouped by voice in first seen order and none is lost`() {
        val shelves = voiceShelvesOf(listOf(momRedhood, dadFisherman, momMaster))
        assertEquals(listOf("mom", "dad"), shelves.map { it.key })
        assertEquals(listOf("엄마", "아빠"), shelves.map { it.voiceLabel })
        assertEquals(listOf(listOf(momRedhood, momMaster), listOf(dadFisherman)), shelves.map { it.stories })
    }

    @Test
    fun `an old list without voice ids groups by the voice name`() {
        val unnamed = listOf(momRedhood.copy(voiceId = null), momMaster.copy(voiceId = null))
        assertEquals(listOf("엄마"), voiceShelvesOf(unnamed).map { it.key })
        assertEquals(emptyList(), voiceShelvesOf(emptyList()))
    }
}
