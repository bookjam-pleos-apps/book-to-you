package com.voicestorybook.vehicle.core.gleo

import kotlin.test.Test
import kotlin.test.assertEquals

class GleoActionTest {
    @Test
    fun `the title is read from a plain or a quoted action parameter`() {
        assertEquals("빨간 모자", storyTitleOf("""{"title":"빨간 모자"}"""))
        assertEquals("빨간 모자", storyTitleOf("\"{\"title\":\"빨간 모자\"}\""))
        assertEquals("빨간 모자", storyTitleOf(""""{\"title\":\" 빨간 모자 \"}""""))
    }

    @Test
    fun `a missing or unreadable parameter means no title`() {
        assertEquals("", storyTitleOf(null))
        assertEquals("", storyTitleOf("{}"))
        assertEquals("", storyTitleOf("빨간 모자"))
        assertEquals("", storyTitleOf("""{"title":null}"""))
    }

    @Test
    fun `the played title travels as a json array string`() {
        assertEquals(
            """{"functionName":"PLAY_STORY","status":"success","message":"ok","mode":"beep","data":"[{\"title\":\"빨간 모자\"}]"}""",
            gleoResponse(PLAY_STORY, GleoStatus.Success, "ok", "빨간 모자"),
        )
    }

    @Test
    fun `a success answers with a beep and a failure is spoken`() {
        assertEquals(
            """{"functionName":"PLAY_STORY","status":"success","message":"ok","mode":"beep"}""",
            gleoResponse(PLAY_STORY, GleoStatus.Success, "ok"),
        )
        assertEquals(
            """{"functionName":"PLAY_STORY","status":"fail","message":"no","mode":"voice"}""",
            gleoResponse(PLAY_STORY, GleoStatus.Fail, "no"),
        )
    }
}
