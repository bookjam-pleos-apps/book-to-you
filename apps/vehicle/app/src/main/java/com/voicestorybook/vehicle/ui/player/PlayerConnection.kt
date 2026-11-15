package com.voicestorybook.vehicle.ui.player

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.voicestorybook.vehicle.playback.PlaybackService

// 화면에서 재생 서비스로 가는 연결. 화면 조작과 스티어링 버튼이 같은 MediaSession을 거친다.
class PlayerConnection(private val context: Context) {
    private var future: ListenableFuture<MediaController>? = null
    var controller: MediaController? = null
        private set

    // 다시 페어링하면 두 번째로 불린다. 이전 연결을 먼저 정리한다.
    fun connect(onReady: (MediaController) -> Unit) {
        release()
        // onTaskRemoved는 시작된(Started) 서비스에만 온다. Media3가 재생을 시작하며 서비스를 시작하는 경로에 기대지 않고 먼저 시작해 둔다.
        context.startService(Intent(context, PlaybackService::class.java))
        val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
        val pending = MediaController.Builder(context, token).buildAsync()
        future = pending
        pending.addListener({ deliver(pending, onReady) }, ContextCompat.getMainExecutor(context))
    }

    // 연결이 끝나기 전에 release(연결 해제, 다시 페어링)되면 늦게 온 결과로 화면을 바꾸지 않는다.
    private fun deliver(pending: ListenableFuture<MediaController>, onReady: (MediaController) -> Unit) {
        if (pending !== future || pending.isCancelled) return
        // 콜백이 connection.controller를 읽을 수 있게 먼저 담고 부른다.
        val ready = pending.get()
        controller = ready
        onReady(ready)
    }

    fun play(items: List<MediaItem>, startIndex: Int, startPositionMs: Long) {
        val player = controller ?: return
        player.setMediaItems(items, startIndex, startPositionMs)
        player.prepare()
        player.play()
    }

    // 계정을 바꾸면 앞 계정의 파일이 지워진다. 올려 둔 이야기를 내려 더 재생하지 않게 한다.
    fun clearPlayer() {
        controller?.run {
            stop()
            clearMediaItems()
        }
    }

    // 시작해 둔 상태를 푼다. 다른 컨트롤러(Pleos 미디어 위젯 등)가 붙어 있으면 그 연결이 끊길 때 서비스가 끝난다.
    fun stopService() {
        context.stopService(Intent(context, PlaybackService::class.java))
    }

    fun release() {
        future?.let(MediaController::releaseFuture)
        future = null
        controller = null
    }
}
