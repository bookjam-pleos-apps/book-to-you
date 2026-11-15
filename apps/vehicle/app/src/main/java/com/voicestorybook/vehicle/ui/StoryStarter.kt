package com.voicestorybook.vehicle.ui

import com.voicestorybook.vehicle.AppGraph
import com.voicestorybook.vehicle.core.library.Story
import com.voicestorybook.vehicle.core.listening.ResumePoint
import com.voicestorybook.vehicle.core.listening.StoryChoice
import com.voicestorybook.vehicle.core.listening.chooseStoryStart
import com.voicestorybook.vehicle.core.listening.resumePointIn
import com.voicestorybook.vehicle.core.port.cachedIds
import com.voicestorybook.vehicle.core.shelf.Book
import com.voicestorybook.vehicle.core.shelf.firstVoiceOf
import com.voicestorybook.vehicle.playback.chapterRefOf
import com.voicestorybook.vehicle.playback.playAllQueue
import com.voicestorybook.vehicle.ui.player.PlayerConnection

// 고른 이야기를 플레이어에 올리고 재생 화면을 연다. 화면 전환은 showPlayer가 맡는다.
class StoryStarter(
    private val graph: AppGraph,
    private val connection: PlayerConnection,
    private val showPlayer: () -> Unit,
) {
    fun loadedRenderId(): String? = chapterRefOf(connection.controller?.currentMediaItem?.mediaId)?.renderId

    // 기한이 지났으면 틀지 않는다(홈은 만료 상태를 그린다). 기록은 홈을 그린 시점 값이 낡았을 수 있어 누르는 순간 다시 읽는다.
    // 이야기가 플레이어에 올라가 재생 화면을 열었으면 true, 틀지 못했으면 false.
    fun play(story: Story): Boolean {
        if (graph.library.expireIfDue()) return false
        val choice = chooseStoryStart(story, loadedRenderId(), graph.history.load())
        if (choice is StoryChoice.Start) {
            val queue = playAllQueue(graph.library.library, story, choice.point.chapterIndex, graph.audio) ?: return false
            connection.play(queue.items, queue.startIndex, choice.point.positionMs)
        }
        showPlayer()
        return true
    }

    // 책을 골랐을 때 처음 골라질 목소리. 목록을 아직 못 그렸거나 받아 둔 목소리가 없으면 null이다.
    fun firstVoice(book: Book): Story? {
        val library = graph.library.library ?: return null
        return firstVoiceOf(book, graph.history.load(), library, graph.audio.cachedIds())
    }

    // 이 목소리로 들으면 시작할 위치. 카운트다운 뒤 재생 화면 미리 보기에 쓴다.
    fun resumePointOf(story: Story): ResumePoint = resumePointIn(graph.history.load(), story)
}
