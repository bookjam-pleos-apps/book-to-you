package com.voicestorybook.vehicle.adapter.store

import com.voicestorybook.vehicle.core.library.AudioAsset
import com.voicestorybook.vehicle.core.library.CachedAudio
import com.voicestorybook.vehicle.core.port.AudioStore
import com.voicestorybook.vehicle.core.port.StagedAudio
import java.io.File

// 파일 이름이 "{audioId}.{sha256}"이라 색인이 따로 없다. 확인을 마친 파일만 이 이름으로 옮긴다.
class FileAudioStore(root: File) : AudioStore {
    private val audioDir = File(root, "audio").apply { mkdirs() }
    private val stagingDir = File(root, "audio-staging").apply { mkdirs() }

    init {
        stagingDir.listFiles()?.forEach { it.delete() }
    }

    fun newStagingFile(audioId: String): File = File.createTempFile("$audioId-", ".part", stagingDir)

    fun fileOf(audioId: String): File? = audioDir.listFiles()?.firstOrNull { idOf(it) == audioId }

    override fun cached(): List<CachedAudio> =
        audioDir.listFiles().orEmpty().mapNotNull { file -> idOf(file)?.let { CachedAudio(it, file.extension) } }

    override fun commit(staged: StagedAudio, asset: AudioAsset): Boolean {
        delete(asset.audioId)
        val moved = File(staged.handle).renameTo(File(audioDir, "${asset.audioId}.${staged.sha256}"))
        if (!moved) discard(staged)
        return moved
    }

    override fun discard(staged: StagedAudio) {
        File(staged.handle).delete()
    }

    override fun delete(audioId: String) {
        audioDir.listFiles()?.filter { idOf(it) == audioId }?.forEach { it.delete() }
    }

    override fun deleteAll() {
        audioDir.listFiles()?.forEach { it.delete() }
    }

    private fun idOf(file: File): String? = file.nameWithoutExtension.takeIf { file.extension.length == 64 }
}
