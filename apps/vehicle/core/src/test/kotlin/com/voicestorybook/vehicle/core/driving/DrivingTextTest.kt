package com.voicestorybook.vehicle.core.driving

import kotlin.test.Test
import kotlin.test.assertEquals

class DrivingTextTest {
    private val stringLimit = setOf(DrivingLimit.StringLength)

    @Test
    fun `the limit applies only while driving with the string length flag`() {
        assertEquals(120, textLimitOf(restrictionOf(true, stringLimit, maxStringLength = 120)))
        assertEquals(null, textLimitOf(restrictionOf(true, setOf(DrivingLimit.Content), maxStringLength = 120)))
        assertEquals(null, textLimitOf(restrictionOf(false, stringLimit, maxStringLength = 120)))
        assertEquals(null, textLimitOf(DrivingRestriction.Unknown))
    }

    @Test
    fun `text within the limit is unchanged`() {
        assertEquals("빨간 모자", limitText("빨간 모자", 5))
        assertEquals("빨간 모자", limitText("빨간 모자", null))
    }

    @Test
    fun `longer text is cut to the limit including the ellipsis`() {
        assertEquals("주인님이…", limitText("주인님이 집을 비운 사이", 5))
        assertEquals("주인님이…", limitText("주인님이 집을 비운 사이", 6))
        assertEquals("…", limitText("빨간 모자", 1))
        assertEquals("", limitText("빨간 모자", 0))
    }

    @Test
    fun `characters outside the basic plane count once and are never split`() {
        assertEquals("🐶🐱", limitText("🐶🐱", 2))
        assertEquals("🐶…", limitText("🐶🐱🐰", 2))
    }
}
