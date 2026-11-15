package com.voicestorybook.vehicle.gleo

import com.voicestorybook.vehicle.BuildConfig
import com.voicestorybook.vehicle.core.gleo.PLAY_STORY
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

// Gleo가 읽는 assets/schema.json은 손으로 적는다. 앱 이름·버전·기능 이름이 코드와 어긋나면 Gleo가 앱을 못 부른다.
class GleoSchemaTest {
    private val schema = Json.parseToJsonElement(File("src/main/assets/schema.json").readText()).jsonObject
    private val functions = schema.getValue("actionCalls").jsonArray.map { it.jsonObject.getValue("function").jsonObject }

    @Test
    fun `the schema names this app and its current version`() {
        assertEquals(BuildConfig.APPLICATION_ID, schema.getValue("packageName").jsonPrimitive.content)
        assertEquals(BuildConfig.VERSION_NAME, schema.getValue("version").jsonPrimitive.content)
    }

    @Test
    fun `every function in the schema is one the app handles and the manifest receives`() {
        val manifest = File("src/main/AndroidManifest.xml").readText()
        val names = functions.map { it.getValue("name").jsonPrimitive.content }
        assertEquals(listOf(PLAY_STORY), names)
        assertTrue(names.all { """<action android:name="$it" />""" in manifest })
        assertTrue(names.all { """<action android:name="${BuildConfig.APPLICATION_ID}.$it" />""" in manifest })
    }
}
