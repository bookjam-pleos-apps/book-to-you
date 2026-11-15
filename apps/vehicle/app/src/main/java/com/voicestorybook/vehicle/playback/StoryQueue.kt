package com.voicestorybook.vehicle.playback

import android.net.Uri
import androidx.core.os.bundleOf
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import com.voicestorybook.vehicle.adapter.store.FileAudioStore
import com.voicestorybook.vehicle.core.library.Story

data class ChapterRef(val renderId: String, val chapterIndex: Int)

private const val SEPARATOR = "#"

// 재생 화면이 표지를 고를 수 있게 이야기 id를 미디어 정보에 함께 싣는다(세션을 거쳐 컨트롤러에 전달된다).
private const val EXTRA_STORY_ID = "storyId"

fun storyIdOf(metadata: MediaMetadata): String? = metadata.extras?.getString(EXTRA_STORY_ID)

fun mediaIdOf(ref: ChapterRef): String = "${ref.renderId}$SEPARATOR${ref.chapterIndex}"

fun chapterRefOf(mediaId: String?): ChapterRef? {
    val parts = mediaId?.split(SEPARATOR)?.takeIf { it.size == 2 } ?: return null
    val index = parts[1].toIntOrNull() ?: return null
    return ChapterRef(parts[0], index)
}

// 받아 둔 파일만으로 재생 목록을 만든다. 한 챕터라도 없으면 null.
fun storyItems(story: Story, audio: FileAudioStore): List<MediaItem>? {
    val chapters = story.chapters.sortedBy { it.index }
    val files = chapters.map { audio.fileOf(it.asset.audioId) ?: return null }
    return chapters.zip(files) { chapter, file ->
        MediaItem.Builder()
            .setMediaId(mediaIdOf(ChapterRef(story.renderId, chapter.index)))
            .setUri(Uri.fromFile(file))
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(story.title)
                    .setSubtitle(chapter.title)
                    .setArtist(story.voiceLabel)
                    .setTrackNumber(chapter.index + 1)
                    .setTotalTrackCount(chapters.size)
                    .setExtras(bundleOf(EXTRA_STORY_ID to story.storyId))
                    .build(),
            )
            .build()
    }
}

// 재생 목록 안의 위치(0부터). 챕터 index가 비어 있어도 맞게 찾는다.
fun playlistPositionOf(story: Story, chapterIndex: Int): Int =
    story.chapters.sortedBy { it.index }.indexOfFirst { it.index == chapterIndex }.coerceAtLeast(0)

val STORY_AUDIO: AudioAttributes = AudioAttributes.Builder()
    .setUsage(C.USAGE_MEDIA)
    // SPEECH로 두면 Media3가 내비 안내(MAY_DUCK) 때 볼륨을 줄이지 않고 멈춘다. Pleos 가이드는 덕킹을 요구한다.
    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
    .build()

val PROMPT_AUDIO: AudioAttributes = AudioAttributes.Builder()
    .setUsage(C.USAGE_MEDIA)
    .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
    .build()
