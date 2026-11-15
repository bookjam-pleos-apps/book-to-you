package com.voicestorybook.vehicle.core.playback

enum class SuppressionCause { None, TransientAudioFocusLoss, UnsuitableAudioOutput, Unknown }

// Pleos 포커스 가이드의 로그 항목 가운데 앱이 알 수 있는 것. 덕킹은 Media3가 감춰 앱이 남길 수 없다.
fun playChangeLogOf(playWhenReady: Boolean, cause: PlayChangeCause): String =
    "${if (playWhenReady) "play" else "pause"} cause=$cause"

fun suppressionLogOf(cause: SuppressionCause): String =
    if (cause == SuppressionCause.None) "suppression cleared" else "suppressed cause=$cause"
