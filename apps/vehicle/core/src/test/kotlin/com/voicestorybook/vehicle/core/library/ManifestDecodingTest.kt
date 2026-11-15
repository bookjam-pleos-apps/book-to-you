package com.voicestorybook.vehicle.core.library

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ManifestDecodingTest {
    private val sharedExample: String =
        File(System.getProperty("contractExamplesDir"), "manifest.json").readText()

    @Test
    fun `decodes the shared contract example`() {
        val library = assertIs<ManifestDecoding.Decoded>(decodeManifest(sharedExample)).library
        val chapter = library.stories.single().chapters.single()
        assertEquals(604_800, library.maxOfflineSeconds)
        assertEquals("render-1", library.stories.single().renderId)
        assertEquals("voice-1", library.stories.single().voiceId)
        assertEquals("chapter-1", chapter.asset.audioId)
        assertEquals("/v1/audio/chapter-1", chapter.asset.audioUrl)
        assertEquals("빨간 모자의 심부름", chapter.title)
        assertTrue(library.prompts.isEmpty())
    }

    @Test
    fun `reads a chapter without a title from an older server`() {
        val older = sharedExample.replace(""""title": "빨간 모자의 심부름",""", "")
        val library = assertIs<ManifestDecoding.Decoded>(decodeManifest(older)).library
        assertEquals(null, library.stories.single().chapters.single().title)
    }

    @Test
    fun `ignores fields added later`() {
        val extended = sharedExample.replaceFirst("{", """{"addedLater": {"x": 1},""")
            .replace("\"prompts\": []", """"prompts": [{"id":"p1","kind":"belt_unfastened","voiceId":"v","durationMs":1,"bytes":1,"sha256":"${"a".repeat(64)}","audioUrl":"/v1/audio/p1"}]""")
        val library = assertIs<ManifestDecoding.Decoded>(decodeManifest(extended)).library
        assertEquals("p1", library.prompts.single().asset.audioId)
        assertEquals("belt_unfastened", library.prompts.single().kind)
        assertEquals("v", library.prompts.single().voiceId)
    }

    @Test
    fun `reads the default voice and treats a missing or null one as none`() {
        assertEquals("voice-1", decodedDefaultVoice(""""defaultVoiceId": "voice-1","""))
        assertNull(decodedDefaultVoice(""""defaultVoiceId": null,"""))
        assertNull(decodedDefaultVoice(""))
    }

    // 공유 예시에 키가 있어도 없어도 같은 입력이 되도록 지우고 다시 넣는다.
    private fun decodedDefaultVoice(field: String): String? {
        val body = sharedExample.replace(Regex(""""defaultVoiceId":\s*[^,]+,"""), "").replaceFirst("{", "{$field")
        return assertIs<ManifestDecoding.Decoded>(decodeManifest(body)).library.defaultVoiceId
    }

    @Test
    fun `rejects another schema version`() {
        assertIs<ManifestDecoding.Rejected>(decodeManifest(sharedExample.replace("\"schemaVersion\": 1", "\"schemaVersion\": 2")))
    }

    @Test
    fun `rejects audio urls outside the audio path`() {
        val outside = sharedExample.replace("/v1/audio/chapter-1", "https://evil.example/a")
        assertIs<ManifestDecoding.Rejected>(decodeManifest(outside))
    }

    @Test
    fun `rejects malformed bodies without throwing`() {
        assertIs<ManifestDecoding.Rejected>(decodeManifest("{"))
        assertIs<ManifestDecoding.Rejected>(decodeManifest("""{"schemaVersion":1}"""))
    }
}
