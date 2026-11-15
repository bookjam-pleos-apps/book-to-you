package com.voicestorybook.vehicle.playback

import androidx.media3.common.Player
import com.voicestorybook.vehicle.core.playback.PlayChangeCause
import com.voicestorybook.vehicle.core.playback.PlaybackPhase
import com.voicestorybook.vehicle.core.playback.StoryPlayback
import com.voicestorybook.vehicle.core.playback.SuppressionCause

fun storyPlaybackOf(player: Player): StoryPlayback = StoryPlayback(player.playWhenReady, phaseOf(player.playbackState))

private fun phaseOf(state: Int): PlaybackPhase = when (state) {
    Player.STATE_BUFFERING -> PlaybackPhase.Buffering
    Player.STATE_READY -> PlaybackPhase.Ready
    Player.STATE_ENDED -> PlaybackPhase.Ended
    else -> PlaybackPhase.Idle
}

fun playChangeCauseOf(reason: Int): PlayChangeCause = when (reason) {
    Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST -> PlayChangeCause.UserRequest
    Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS -> PlayChangeCause.AudioFocusLoss
    Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_BECOMING_NOISY -> PlayChangeCause.AudioBecomingNoisy
    Player.PLAY_WHEN_READY_CHANGE_REASON_REMOTE -> PlayChangeCause.Remote
    Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM -> PlayChangeCause.EndOfMediaItem
    Player.PLAY_WHEN_READY_CHANGE_REASON_SUPPRESSED_TOO_LONG -> PlayChangeCause.SuppressedTooLong
    else -> PlayChangeCause.Unknown
}

fun suppressionCauseOf(reason: Int): SuppressionCause = when (reason) {
    Player.PLAYBACK_SUPPRESSION_REASON_NONE -> SuppressionCause.None
    Player.PLAYBACK_SUPPRESSION_REASON_TRANSIENT_AUDIO_FOCUS_LOSS -> SuppressionCause.TransientAudioFocusLoss
    Player.PLAYBACK_SUPPRESSION_REASON_UNSUITABLE_AUDIO_OUTPUT -> SuppressionCause.UnsuitableAudioOutput
    else -> SuppressionCause.Unknown
}
