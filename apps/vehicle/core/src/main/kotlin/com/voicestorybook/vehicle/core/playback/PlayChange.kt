package com.voicestorybook.vehicle.core.playback

// Media3가 재생 의도(playWhenReady)를 바꾼 이유를 core가 판단할 수 있게 옮긴 값.
enum class PlayChangeCause { UserRequest, AudioFocusLoss, AudioBecomingNoisy, Remote, EndOfMediaItem, SuppressedTooLong, Unknown }

// 오디오 포커스를 영구히 잃으면 멈추는 데서 그치지 않고 정지한다(Pleos 포커스 가이드: LOSS는 즉시 정지, 세션이 active로 남지 않게).
// 통화처럼 잠깐 잃는 경우는 playWhenReady가 바뀌지 않고 억제 이유로 오므로 여기에 걸리지 않는다.
fun shouldStopAfterPause(playWhenReady: Boolean, cause: PlayChangeCause): Boolean =
    !playWhenReady && cause == PlayChangeCause.AudioFocusLoss
