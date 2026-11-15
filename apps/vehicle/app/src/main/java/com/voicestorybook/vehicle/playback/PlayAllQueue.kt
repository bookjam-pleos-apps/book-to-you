package com.voicestorybook.vehicle.playback

import androidx.media3.common.MediaItem
import com.voicestorybook.vehicle.adapter.store.FileAudioStore
import com.voicestorybook.vehicle.core.library.Library
import com.voicestorybook.vehicle.core.library.Story
import com.voicestorybook.vehicle.core.listening.ListeningMark
import com.voicestorybook.vehicle.core.listening.playAllStories
import com.voicestorybook.vehicle.core.listening.resumePointIn
import com.voicestorybook.vehicle.core.port.cachedIds

data class PlayAllQueue(val items: List<MediaItem>, val startIndex: Int, val startPositionMs: Long = 0)

// 전체 재생 목록: 고른 이야기의 장들 뒤에 같은 목소리의 다음 이야기 장들을 잇는다(playAllStories).
// 한 목록이라 화면 버튼·스티어링 키·이야기 끝이 모두 Media3 기본 동작으로 다음 이야기로 넘어간다.
// 고른 이야기의 파일이 하나라도 없으면 null.
fun playAllQueue(library: Library?, story: Story, chapterIndex: Int, audio: FileAudioStore): PlayAllQueue? {
    val first = storyItems(story, audio) ?: return null
    val stories = library?.let { playAllStories(it, story, audio.cachedIds()) } ?: listOf(story)
    val following = stories.drop(1).flatMap { storyItems(it, audio).orEmpty() }
    return PlayAllQueue(first + following, playlistPositionOf(story, chapterIndex))
}

// 기록에 남은 이어 들을 자리부터 전체 재생한다. 차량 미디어 화면에서 고를 때와 앱이 꺼진 뒤 이어 재생할 때 쓴다.
fun resumeQueue(library: Library?, story: Story, history: List<ListeningMark>, audio: FileAudioStore): PlayAllQueue? {
    val point = resumePointIn(history, story)
    return playAllQueue(library, story, point.chapterIndex, audio)?.copy(startPositionMs = point.positionMs)
}

// 지금 장이 속한 이야기의 첫 장 위치. 목록이 여러 이야기를 이어 붙여서, 처음으로 되감을 때 이 이야기 안에서만 돌아간다.
fun storyStartIndex(mediaIds: List<String?>, current: Int): Int {
    val renderId = chapterRefOf(mediaIds.getOrNull(current))?.renderId ?: return 0
    val before = mediaIds.take(current + 1).indexOfLast { chapterRefOf(it)?.renderId != renderId }
    return before + 1
}
