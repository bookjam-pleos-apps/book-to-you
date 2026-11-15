package com.voicestorybook.vehicle.ui.splash

import com.voicestorybook.vehicle.core.start.SPLASH_DURATION
import com.voicestorybook.vehicle.ui.Screen
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// 앱을 켤 때 잠깐 보이는 화면(screen_splash). 누르는 곳이 없어 정차 여부와 상관없다.
class SplashScreen(private val scope: CoroutineScope, private val onDone: () -> Unit) : Screen {
    private var waiting: Job? = null

    fun start() {
        waiting = scope.launch {
            delay(SPLASH_DURATION)
            onDone()
        }
    }

    override fun setParked(parked: Boolean) = Unit

    override fun release() {
        waiting?.cancel()
    }
}
