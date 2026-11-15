package com.voicestorybook.vehicle.adapter.http

import com.voicestorybook.vehicle.adapter.store.FileAudioStore
import com.voicestorybook.vehicle.core.library.AudioAsset
import com.voicestorybook.vehicle.core.port.Fetched
import com.voicestorybook.vehicle.core.port.LibraryGateway
import com.voicestorybook.vehicle.core.port.StagedAudio
import okhttp3.Response
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.security.DigestOutputStream
import java.security.MessageDigest

class HttpLibraryGateway(private val http: ApiHttp, private val audio: FileAudioStore) : LibraryGateway {
    override suspend fun fetchManifest(): Fetched<String> {
        val reply = http.get("/v1/library/manifest") ?: return Fetched.Failed("network")
        if (reply.code == 401) return Fetched.Unauthorized
        if (reply.code != 200) return Fetched.Failed("http ${reply.code}")
        return Fetched.Ok(reply.body)
    }

    // 서버는 Range를 지원하지만, 챕터는 수 MB라 끊기면 처음부터 다시 받는다.
    override suspend fun download(asset: AudioAsset): Fetched<StagedAudio> =
        http.stream(asset.audioUrl) { response -> stage(response, asset) } ?: Fetched.Failed("network")

    private fun stage(response: Response, asset: AudioAsset): Fetched<StagedAudio> {
        if (response.code == 401) return Fetched.Unauthorized
        val body = response.body
        if (response.code != 200 || body == null) return Fetched.Failed("http ${response.code}")
        val target = audio.newStagingFile(asset.audioId)
        val sha256 = try {
            body.byteStream().use { copyHashing(it, target) }
        } catch (e: IOException) {
            target.delete()
            throw e
        }
        return Fetched.Ok(StagedAudio(target.absolutePath, sha256))
    }
}

private fun copyHashing(input: InputStream, target: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    DigestOutputStream(target.outputStream(), digest).use { input.copyTo(it) }
    return digest.digest().joinToString("") { "%02x".format(it) }
}
