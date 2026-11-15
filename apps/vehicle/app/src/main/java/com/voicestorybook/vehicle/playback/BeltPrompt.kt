package com.voicestorybook.vehicle.playback

import com.voicestorybook.vehicle.adapter.store.FileAudioStore
import com.voicestorybook.vehicle.core.library.BELT_UNFASTENED
import com.voicestorybook.vehicle.core.library.Library
import com.voicestorybook.vehicle.core.library.promptFor
import java.io.File

// 지금 듣는 이야기와 같은 목소리의 벨트 안내. 메모리의 라이브러리와 받아 둔 파일만 본다.
fun beltPromptFile(library: Library?, audio: FileAudioStore, renderId: String?): File? {
    val current = library ?: return null
    val cached = current.copy(prompts = current.prompts.filter { audio.fileOf(it.asset.audioId) != null })
    val voiceId = renderId?.let(current::story)?.voiceId
    return promptFor(cached, BELT_UNFASTENED, voiceId)?.let { audio.fileOf(it.asset.audioId) }
}
