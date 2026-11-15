package com.voicestorybook.vehicle.res

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals

// 1700×1184 앱 하나 창은 분할 창용 조건(h1000dp 키 큰 창, w800dp 840 창)도 모두 만족한다. 자원은 더 넓은 너비 조건이 먼저라,
// 분할 창 폴더에서 바꾼 이름이 w1200dp에 없으면 그 값이 앱 하나 창의 Figma 화면까지 바꾼다.
class WindowSizeResourcesTest {
    private val res = File("src/main/res")

    private fun namesIn(folder: String): Set<String> =
        File(res, folder).listFiles().orEmpty()
            .filter { it.extension == "xml" }
            .flatMap { file -> NAME.findAll(file.readText()).map { it.groupValues[1] }.toList() }
            .toSet()

    @Test
    fun `every split window value is reset for the single app window`() {
        val single = namesIn("values-w1200dp")
        SPLIT_WINDOW_FOLDERS.forEach { folder ->
            assertEquals(emptySet(), namesIn(folder) - single, "$folder 에서 바꾸고 values-w1200dp에 짝이 없는 이름")
        }
    }

    // 창마다 다른 화면 결정(표지 모양, 감지 줄)은 앱 하나 창 값이 따로 적혀 있어야 Figma 화면이 좁은 창 값을 물려받지 않는다.
    @Test
    fun `every window flag states its single app window value`() {
        assertEquals(emptySet(), boolsIn("values") - boolsIn("values-w1200dp"), "values-w1200dp에 값이 없는 bool")
    }

    private fun boolsIn(folder: String): Set<String> =
        File(res, "$folder/bools.xml").readText().let { text -> BOOL.findAll(text).map { it.groupValues[1] }.toSet() }

    private companion object {
        val SPLIT_WINDOW_FOLDERS = listOf("values-h1000dp", "values-w800dp")
        val BOOL = Regex("""<bool\s+name="([^"]+)"""")
        val NAME = Regex("""<(?:dimen|bool|integer)\s+name="([^"]+)"""")
    }
}
