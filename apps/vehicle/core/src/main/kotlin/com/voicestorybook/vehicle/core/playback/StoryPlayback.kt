package com.voicestorybook.vehicle.core.playback

// Media3 플레이어 상태를 core가 판단할 수 있게 옮긴 값. Idle은 준비 전이거나 오류로 멈춘 상태다.
enum class PlaybackPhase { Idle, Buffering, Ready, Ended }

data class StoryPlayback(val playWhenReady: Boolean, val phase: PlaybackPhase)

enum class ToggleAction { Play, Pause }

// 재생 의도가 있고 소리를 낼 수 있는 단계. Media3는 끝난 뒤(Ended)와 오류(Idle)에도 playWhenReady를 true로 두므로 단계를 같이 본다.
// isPlaying과 달리 버퍼링 중과 통화·음성인식으로 잠깐 멈춘 동안도 포함한다.
fun isStoryUnderway(playback: StoryPlayback): Boolean =
    playback.playWhenReady && (playback.phase == PlaybackPhase.Buffering || playback.phase == PlaybackPhase.Ready)

// 벨트·뒷문 이벤트로 이야기를 멈추고 안내를 낼지. PLAN: "이야기를 재생하던 중일 때만".
fun shouldInterruptStory(playback: StoryPlayback): Boolean = isStoryUnderway(playback)

// 재생 화면 가운데 버튼이 누르면 할 일. 라벨도 이 값을 따라 라벨과 동작이 어긋나지 않는다(A2).
// Idle·Ended에서는 소리가 나지 않으니 재생을 보인다. 누르면 Media3가 준비하거나 처음으로 돌려 튼다.
fun toggleActionOf(playback: StoryPlayback): ToggleAction =
    if (isStoryUnderway(playback)) ToggleAction.Pause else ToggleAction.Play
