package com.voicestorybook.vehicle.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.activity.addCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.voicestorybook.vehicle.R
import com.voicestorybook.vehicle.core.driving.isParked
import com.voicestorybook.vehicle.core.pairing.homeAccountActionOf
import com.voicestorybook.vehicle.core.playback.shouldStopServiceOnClose
import com.voicestorybook.vehicle.core.start.BookStart
import com.voicestorybook.vehicle.core.start.showsSplash
import com.voicestorybook.vehicle.core.usecase.LIBRARY_REFRESH_INTERVAL
import com.voicestorybook.vehicle.core.usecase.refreshEvery
import com.voicestorybook.vehicle.graph
import com.voicestorybook.vehicle.playback.storyPlaybackOf
import com.voicestorybook.vehicle.ui.countdown.CountdownActions
import com.voicestorybook.vehicle.ui.countdown.CountdownChoices
import com.voicestorybook.vehicle.ui.countdown.CountdownScreen
import com.voicestorybook.vehicle.ui.home.HomeActions
import com.voicestorybook.vehicle.ui.home.HomeScreen
import com.voicestorybook.vehicle.ui.pairing.PairingMode
import com.voicestorybook.vehicle.ui.pairing.PairingScreen
import com.voicestorybook.vehicle.ui.pairing.unpairedModeOf
import com.voicestorybook.vehicle.ui.player.PlayerConnection
import com.voicestorybook.vehicle.ui.player.PlayerScreen
import com.voicestorybook.vehicle.ui.splash.SplashScreen

// 창 크기를 바꾸면(분할 화면 전환) 액티비티가 다시 만들어진다. 재생 화면을 보던 중이었으면 그 화면으로 돌아간다.
private const val KEY_SHOWING_PLAYER = "showingPlayer"

class MainActivity : AppCompatActivity() {
    private val connection by lazy { PlayerConnection(this) }
    private val starter by lazy { StoryStarter(graph, connection, ::showPlayer) }
    private val launcher by lazy {
        BookLauncher(graph, starter, BookScreens(::showHome, ::showPlayer, ::showCountdown, { current is CountdownScreen }, ::isParkedNow))
    }
    private val gleo by lazy { GleoPlayRequest(this, graph, starter, connection) }
    private var current: Screen? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        openScreens += 1
        graph.driving.start()
        watchDriving()
        watchPairing()
        refreshWhileVisible()
        onBackPressedDispatcher.addCallback(this) { goBack() }
        if (savedInstanceState == null) gleo.accept(intent, playerReadiness())
        val wasShowingPlayer = savedInstanceState?.getBoolean(KEY_SHOWING_PLAYER) == true
        if (showsSplash(isRecreated = savedInstanceState != null)) showSplash() else openFirstScreen(wasShowingPlayer)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        gleo.accept(intent, playerReadiness())
    }

    // 연결 화면(계정 바꾸기 포함)에서는 음성 요청을 받지 않는다. 스플래시 중이거나 플레이어 연결 전이면 곧 틀 수 있다.
    private fun playerReadiness(): PlayerReadiness = when {
        current is PairingScreen -> PlayerReadiness.Unavailable
        connection.controller != null && current !is SplashScreen -> PlayerReadiness.Ready
        else -> PlayerReadiness.Starting
    }

    private fun showSplash() {
        inflate(R.layout.screen_splash)
        show(SplashScreen(lifecycleScope) { openFirstScreen() }.also(SplashScreen::start))
    }

    private fun openFirstScreen(returnToPlayer: Boolean = false) = if (graph.session.isPaired()) openLibrary(returnToPlayer) else showPairing()

    // 스플래시와 연결 화면은 스스로 다음 화면을 연다. 그동안에는 목록 받기와 연결 끊김 처리를 끼워 넣지 않는다.
    private fun isEntering(): Boolean = current is SplashScreen || current is PairingScreen

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putBoolean(KEY_SHOWING_PLAYER, current is PlayerScreen)
    }

    // 앱을 켜 둔 채 7일 기한이 지났거나, 오프라인이던 차가 다시 연결됐을 수 있다. 돌아올 때마다 기한을 따지고 다시 받는다.
    override fun onStart() {
        super.onStart()
        if (!canRefresh()) return
        graph.library.expireIfDue()
        graph.session.refreshInBackground()
    }

    // 다른 앱이 창을 덮으면(onStop) 보지 않는 카운트다운이 저절로 재생하지 않게 취소하고 목록으로 돌린다.
    // Pleos 홈 키는 창을 가리지 않아 여기로 오지 않는다(카운트다운이 그대로 보인다).
    // 창 크기를 바꿀 때(다시 만들어질 때)는 새 화면이 어차피 목록부터 그리므로 건너뛴다.
    override fun onStop() {
        super.onStop()
        if (current is CountdownScreen && !isChangingConfigurations) showHome()
    }

    override fun onDestroy() {
        show(null)
        openScreens -= 1
        val playback = connection.controller?.let(::storyPlaybackOf)
        if (shouldStopServiceOnClose(isChangingConfigurations, openScreens, playback)) connection.stopService()
        connection.release()
        graph.driving.stop()
        super.onDestroy()
    }

    private fun canRefresh(): Boolean = graph.session.isPaired() && !isEntering()

    // 보이는 동안(STARTED) 주기적으로 받는다. 홈 키로는 onStart가 오지 않아 웹에서 새로 만든 동화가 책장에 나타나지 않았다.
    // 받기는 앱 범위에서 돈다. 화면이 멈춰도 내려받던 파일이 끊기지 않는다.
    private fun refreshWhileVisible() = whileStarted {
        refreshEvery(LIBRARY_REFRESH_INTERVAL, ::canRefresh) {
            graph.library.expireIfDue()
            graph.session.refreshInBackground(announce = false)
        }
    }

    private fun watchDriving() = whileStarted { graph.driving.restriction.collect { current?.setParked(isParked(it)) } }

    // 연결이 끊기면(토큰 거부, 연결 끊기 버튼) 재생은 서비스가 멈추고, 화면은 연결 화면으로 간다.
    private fun watchPairing() = whileStarted { graph.session.paired.collect { paired -> if (!paired && !isEntering()) showUnpaired() } }

    private fun showUnpaired() {
        connection.release()
        showPairing()
    }

    // CCP·Back 키(필수): 하위 화면(재생, 카운트다운)은 목록으로, 최상단은 앱을 뒤로 보낸다. 이야기는 서비스에서 계속 나온다.
    private fun goBack() {
        val screen = current
        if (screen is PlayerScreen || screen is CountdownScreen) return showHome()
        if (screen is PairingScreen && screen.goBack()) return
        moveTaskToBack(true)
    }

    private fun isParkedNow(): Boolean = isParked(graph.driving.restriction.value)

    // 받아 둔 목록을 바로 보여 주고 동기화를 시작한다.
    private fun openLibrary(returnToPlayer: Boolean = false) {
        graph.library.restore()
        connection.connect {
            if (returnToPlayer && starter.loadedRenderId() != null) showPlayer() else showHome()
            gleo.playPending()
        }
        graph.session.refreshInBackground()
    }

    private fun showPairing(mode: PairingMode = unpairedModeOf(graph, this)) {
        val screen = PairingScreen(inflate(R.layout.screen_pairing), graph.pairDevice, graph.pairWithDemoCode, this, mode) { account, token ->
            if (mode is PairingMode.SwitchAccount) switchToOwnAccount(token) else graph.session.completePairing(account, token)
            openLibrary()
        }
        show(screen)
        screen.start()
    }

    // 시연 계정의 홈에서 "내 목소리로 시작하기". 돌아갈 때 시연 계정 연결이 그사이 끊겼으면 연결 화면으로 간다.
    private fun startWithMyVoice() = showPairing(PairingMode.SwitchAccount { if (graph.session.isPaired()) showHome() else showUnpaired() })

    private fun switchToOwnAccount(token: String) {
        connection.clearPlayer()
        graph.session.switchToOwnAccount(token)
    }

    // 지금 플레이어에 올라간 이야기는 홈의 이어서 듣기 카드로 다시 연다(chooseStoryStart가 재생 화면만 연다).
    private fun showHome() {
        val account = homeAccountActionOf(graph.autoPairCode != null, graph.session.account())
        val actions = HomeActions({ starter.play(it.story) }, launcher::choose, graph.session::unpair, account, ::startWithMyVoice, starter::loadedRenderId)
        val screen = HomeScreen(inflate(R.layout.screen_home), graph.library.status, graph.driving.restriction, graph.arrival, graph.audio, graph.history, lifecycleScope, lifecycle, actions)
        show(screen)
        screen.start()
    }

    private fun showCountdown(start: BookStart.Countdown, choices: CountdownChoices, actions: CountdownActions) {
        val screen = CountdownScreen(inflate(R.layout.screen_countdown), start, choices, lifecycleScope, actions)
        show(screen)
        screen.start()
    }

    private fun showPlayer() {
        val player = connection.controller ?: return
        show(PlayerScreen(inflate(R.layout.screen_player), player, graph.cabinGuard, graph.driving.restriction, lifecycleScope, graph.reports::send) { showHome() })
    }

    // 이전 화면의 구독과 작업을 정리하고, 새 화면에 지금의 정차 여부를 알린다.
    private fun show(next: Screen?) {
        current?.release()
        current = next
        next?.setParked(isParkedNow())
    }

    private fun inflate(layout: Int): View = layoutInflater.inflate(layout, null).also(::setContentView)

    // 프로세스 안에서 열려 있는 이 화면의 수. 태스크를 비우고 다시 열면 새 화면이 먼저 뜨고 옛 화면이 나중에 닫힌다.
    private companion object {
        var openScreens = 0
    }
}
