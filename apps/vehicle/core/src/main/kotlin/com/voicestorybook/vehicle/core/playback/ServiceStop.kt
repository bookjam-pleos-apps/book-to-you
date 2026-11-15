package com.voicestorybook.vehicle.core.playback

// 화면이 닫힐 때 시작해 둔 재생 서비스도 끝낼지(Pleos: 백그라운드 작업 최소화).
// 끝내지 않는 경우: 설정 변경으로 다시 만들어질 때, 다른 화면이 아직 열려 있을 때(새 화면이 먼저 뜨고 옛 화면이 나중에 닫힌다),
// 이야기가 나오고 있을 때. playback이 null이면 플레이어에 연결되지 않은 것이라 나오는 이야기가 없다.
fun shouldStopServiceOnClose(changingConfigurations: Boolean, screensStillOpen: Int, playback: StoryPlayback?): Boolean =
    !changingConfigurations && screensStillOpen == 0 && playback?.let(::isStoryUnderway) != true
