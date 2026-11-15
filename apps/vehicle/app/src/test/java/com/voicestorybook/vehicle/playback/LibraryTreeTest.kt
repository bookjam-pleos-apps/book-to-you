package com.voicestorybook.vehicle.playback

import com.voicestorybook.vehicle.core.library.Story
import com.voicestorybook.vehicle.core.shelf.VoiceShelf
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class LibraryTreeTest {
    private val story = Story("r1", "redhood", "빨간 모자", "엄마", emptyList(), "mom")

    @Test
    fun `a story chosen on the car media screen maps back to its render`() {
        val item = libraryStoryItem(story)
        assertEquals("r1", renderIdOfLibraryItem(item.mediaId))
        assertTrue(item.mediaMetadata.isPlayable == true)
    }

    @Test
    fun `chapter items queued by the app screen pass through`() {
        assertNull(renderIdOfLibraryItem(mediaIdOf(ChapterRef("r1", 0))))
    }

    @Test
    fun `a voice is a folder that maps back to its key`() {
        val item = libraryVoiceItem(VoiceShelf("mom", "엄마", listOf(story)), "엄마 목소리")
        assertEquals("mom", voiceKeyOfLibraryItem(item.mediaId))
        assertEquals("엄마 목소리", item.mediaMetadata.title)
        assertTrue(item.mediaMetadata.isBrowsable == true && item.mediaMetadata.isPlayable == false)
        assertNull(voiceKeyOfLibraryItem(libraryStoryItem(story).mediaId))
    }

    @Test
    fun `the root is browsable only`() {
        val root = libraryRootItem()
        assertEquals(LIBRARY_ROOT_ID, root.mediaId)
        assertTrue(root.mediaMetadata.isBrowsable == true && root.mediaMetadata.isPlayable == false)
    }
}
