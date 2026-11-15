package com.voicestorybook.vehicle.core.start

import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds

val SPLASH_DURATION: Duration = 1500.milliseconds

// 새로 켠 화면에서만 보인다. 창 크기를 바꾸면(분할 전환) 화면이 다시 만들어지는데, 그때 또 보이면 듣던 화면을 가린다.
fun showsSplash(isRecreated: Boolean): Boolean = !isRecreated
