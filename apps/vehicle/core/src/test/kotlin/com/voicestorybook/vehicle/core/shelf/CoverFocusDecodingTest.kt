package com.voicestorybook.vehicle.core.shelf

import kotlin.test.Test
import kotlin.test.assertEquals

class CoverFocusDecodingTest {
    @Test
    fun `reads focus and subject boxes by art name`() {
        val body = """{"schemaVersion":1,"covers":{
            "cover_a":{"x":0.3,"y":0.4,"subjects":[{"label":"cat","left":0.1,"top":0.2,"right":0.5,"bottom":0.9}]},
            "cover_b":{"x":0.7,"y":0.5,"note":"모르는 키는 무시"}}}"""
        assertEquals(
            mapOf(
                "cover_a" to CoverFocus(0.3, 0.4, listOf(NormRect(0.1, 0.2, 0.5, 0.9))),
                "cover_b" to CoverFocus(0.7, 0.5),
            ),
            decodeCoverFocus(body),
        )
    }

    @Test
    fun `drops entries outside the image or with an inverted subject box`() {
        val body = """{"schemaVersion":1,"covers":{
            "outside":{"x":1.2,"y":0.5},
            "inverted":{"x":0.5,"y":0.5,"subjects":[{"left":0.6,"top":0.2,"right":0.4,"bottom":0.9}]},
            "ok":{"x":0.5,"y":0.5}}}"""
        assertEquals(setOf("ok"), decodeCoverFocus(body).keys)
    }

    @Test
    fun `reads the marked protagonist box`() {
        val body = """{"schemaVersion":1,"covers":{"cover_a":{"x":0.5,"y":0.5,"subjects":[
            {"left":0.1,"top":0.2,"right":0.3,"bottom":0.9,"protagonist":true},
            {"left":0.6,"top":0.2,"right":0.8,"bottom":0.9}]}}}"""
        val focus = decodeCoverFocus(body).getValue("cover_a")
        assertEquals(NormRect(0.1, 0.2, 0.3, 0.9), focus.protagonist)
        assertEquals(2, focus.subjects.size)
    }

    @Test
    fun `a cover with two protagonists is dropped`() {
        val body = """{"schemaVersion":1,"covers":{
            "two":{"x":0.5,"y":0.5,"subjects":[
                {"left":0.1,"top":0.2,"right":0.3,"bottom":0.9,"protagonist":true},
                {"left":0.6,"top":0.2,"right":0.8,"bottom":0.9,"protagonist":true}]},
            "none":{"x":0.5,"y":0.5,"subjects":[{"left":0.1,"top":0.2,"right":0.3,"bottom":0.9}]}}}"""
        val table = decodeCoverFocus(body)
        assertEquals(setOf("none"), table.keys)
        assertEquals(null, table.getValue("none").protagonist)
    }

    @Test
    fun `unreadable or newer files fall back to no focus`() {
        assertEquals(emptyMap(), decodeCoverFocus("not json"))
        assertEquals(emptyMap(), decodeCoverFocus("""{"schemaVersion":2,"covers":{}}"""))
    }
}
