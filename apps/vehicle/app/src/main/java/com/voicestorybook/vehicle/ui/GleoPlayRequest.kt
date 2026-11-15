package com.voicestorybook.vehicle.ui

import android.content.Context
import android.content.Intent
import com.voicestorybook.vehicle.AppGraph
import com.voicestorybook.vehicle.core.gleo.GleoStatus
import com.voicestorybook.vehicle.core.gleo.PLAY_STORY
import com.voicestorybook.vehicle.core.gleo.gleoResponse
import com.voicestorybook.vehicle.core.gleo.storyTitleOf
import com.voicestorybook.vehicle.core.library.Story
import com.voicestorybook.vehicle.core.library.playableStories
import com.voicestorybook.vehicle.core.listening.storyForVoiceRequest
import com.voicestorybook.vehicle.core.port.cachedIds
import com.voicestorybook.vehicle.ui.player.PlayerConnection

private const val ACTION_PARAM = "ACTION_PARAM"
private const val GLEO_RESPONSE = "ai.pleos.playground.intent.action.APP_ACTION_RESPONSE"

// 요청이 왔을 때 화면의 상태. Starting은 앱을 막 켜서 플레이어 연결을 기다리는 중이다.
enum class PlayerReadiness { Ready, Starting, Unavailable }

// Gleo가 음성 명령("빨간 모자 틀어줘")을 기능 호출(PLAY_STORY)로 바꿔 앱 화면에 보낸 요청.
// 앱을 막 켠 때에 오면 적어 두었다가 플레이어가 연결되면 튼다. 연결이 없거나 연결 화면이면 기다리지 않고 거절한다
// (Gleo는 7초 뒤 요청을 버린다. 한참 뒤에 갑자기 틀지 않는다).
class GleoPlayRequest(
    private val context: Context,
    private val graph: AppGraph,
    private val starter: StoryStarter,
    private val connection: PlayerConnection,
) {
    private var pendingTitle: String? = null

    fun accept(intent: Intent?, readiness: PlayerReadiness) {
        if (intent?.action?.endsWith(PLAY_STORY) != true) return
        if (!graph.session.isPaired() || readiness == PlayerReadiness.Unavailable) {
            return respond(GleoStatus.Fail, "The app is not connected to a parent's account yet.")
        }
        pendingTitle = storyTitleOf(intent.getStringExtra(ACTION_PARAM))
        if (readiness == PlayerReadiness.Ready) playPending()
    }

    // 이미 올려 둔 이야기면 StoryStarter가 재생 화면만 연다. 멈춰 있을 수 있어 재생을 한 번 더 건다.
    fun playPending() {
        val title = pendingTitle ?: return
        pendingTitle = null
        val story = storyNamed(title) ?: return respond(GleoStatus.Fail, "No story with that title is available in the app.")
        if (!starter.play(story)) return respond(GleoStatus.Fail, "The story ${story.title} cannot be played right now.")
        connection.controller?.play()
        respond(GleoStatus.Success, "Started playing the story ${story.title}.", story.title)
    }

    private fun storyNamed(title: String): Story? {
        val playable = playableStories(graph.library.library, graph.audio.cachedIds())
        return storyForVoiceRequest(playable, graph.history.load().firstOrNull()?.renderId, title)
    }

    private fun respond(status: GleoStatus, message: String, playedTitle: String? = null) {
        val response = Intent(GLEO_RESPONSE)
            .putExtra("packageName", context.packageName)
            .putExtra("response", gleoResponse(PLAY_STORY, status, message, playedTitle))
        context.sendBroadcast(response)
    }
}
