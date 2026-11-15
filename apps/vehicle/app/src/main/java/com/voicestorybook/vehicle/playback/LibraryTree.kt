package com.voicestorybook.vehicle.playback

import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import com.voicestorybook.vehicle.core.library.Story
import com.voicestorybook.vehicle.core.shelf.VoiceShelf

// 차량 미디어 화면(Pleos 미디어 카드, 미디어 센터)이 둘러보는 트리: 뿌리 → 목소리(폴더) → 이야기(바로 재생).
// Pleos 미디어 앱은 뿌리 바로 아래를 탭으로 그리고 탭마다 하위 목록을 묻는다. 그래서 뿌리 아래에 이야기를 바로 두지 않는다.
// 장은 재생 목록에서만 보인다.
const val LIBRARY_ROOT_ID = "root"
private const val VOICE_PREFIX = "voice:"
private const val STORY_PREFIX = "story:"

fun libraryRootItem(): MediaItem = MediaItem.Builder()
    .setMediaId(LIBRARY_ROOT_ID)
    .setMediaMetadata(MediaMetadata.Builder().setIsBrowsable(true).setIsPlayable(false).build())
    .build()

fun libraryVoiceItem(shelf: VoiceShelf, title: String): MediaItem = MediaItem.Builder()
    .setMediaId(VOICE_PREFIX + shelf.key)
    .setMediaMetadata(MediaMetadata.Builder().setTitle(title).setIsBrowsable(true).setIsPlayable(false).build())
    .build()

fun voiceKeyOfLibraryItem(mediaId: String): String? = mediaId.takeIf { it.startsWith(VOICE_PREFIX) }?.removePrefix(VOICE_PREFIX)

fun libraryStoryItem(story: Story): MediaItem = MediaItem.Builder()
    .setMediaId(STORY_PREFIX + story.renderId)
    .setMediaMetadata(
        MediaMetadata.Builder()
            .setTitle(story.title)
            .setArtist(story.voiceLabel)
            .setIsBrowsable(false)
            .setIsPlayable(true)
            .build(),
    )
    .build()

// 미디어 화면에서 고른 이야기의 렌더 id. 앱 화면이 올린 장 항목(renderId#index)이면 null.
fun renderIdOfLibraryItem(mediaId: String): String? = mediaId.takeIf { it.startsWith(STORY_PREFIX) }?.removePrefix(STORY_PREFIX)
