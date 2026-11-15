package com.voicestorybook.vehicle.core.usecase

import kotlinx.coroutines.delay
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

// 앱이 보이는 동안 manifest를 다시 받는 간격. 부모가 웹에서 만든 동화가 차에서 앱을 다시 열지 않아도 책장에 나타난다.
// Pleos는 홈 키를 눌러도 앱 창이 보인 채 남아 onStart가 거의 오지 않는다.
val LIBRARY_REFRESH_INTERVAL: Duration = 60.seconds

// 부르는 코루틴이 취소될 때까지 돈다. 첫 갱신은 간격 뒤다. 화면이 뜰 때는 onStart가 이미 받는다.
suspend fun refreshEvery(interval: Duration, shouldRefresh: () -> Boolean, refresh: () -> Unit): Nothing {
    while (true) {
        delay(interval)
        if (shouldRefresh()) refresh()
    }
}
