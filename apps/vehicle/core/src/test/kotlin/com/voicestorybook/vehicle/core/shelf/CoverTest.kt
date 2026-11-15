package com.voicestorybook.vehicle.core.shelf

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class CoverTest {
    @Test
    fun `demo stories pick their art by story id`() {
        assertEquals(Cover("redhood", CoverTone.Red), coverOf("redhood"))
        assertEquals(Cover("fisherman", CoverTone.Sea), coverOf("fisherman"))
        assertEquals(Cover("masteraway", CoverTone.Mint), coverOf("masteraway"))
    }

    @Test
    fun `art prefers the asked shape and falls back to the other one`() {
        val both = CoverArt(portrait = PORTRAIT, landscape = LANDSCAPE)
        assertEquals(PORTRAIT, both.pick(CoverShape.Portrait))
        assertEquals(LANDSCAPE, both.pick(CoverShape.Landscape))
        assertEquals(LANDSCAPE, CoverArt(portrait = null, landscape = LANDSCAPE).pick(CoverShape.Portrait))
        assertEquals(PORTRAIT, CoverArt(portrait = PORTRAIT, landscape = null).pick(CoverShape.Landscape))
        assertNull(CoverArt(null, null).pick(CoverShape.Portrait))
    }

    @Test
    fun `other stories get a color block that stays the same for the same id`() {
        val cover = coverOf("some-new-story")
        assertNull(cover.artKey)
        assertEquals(cover, coverOf("some-new-story"))
    }

    // 웹(apps/web/src/features/library/cover.test.ts)도 같은 id에 같은 색을 기대한다. 한쪽 규칙을 바꾸면 둘 다 고친다.
    @Test
    fun `color blocks match the web rule for the same ids`() {
        assertEquals(CoverTone.Sea, coverOf("hello").tone)
        assertEquals(CoverTone.Sea, coverOf("polygenelubricants").tone)
        assertEquals(CoverTone.Red, coverOf("c").tone)
        assertEquals(CoverTone.Mint, coverOf("b").tone)
    }
}

private const val PORTRAIT = 1
private const val LANDSCAPE = 2
