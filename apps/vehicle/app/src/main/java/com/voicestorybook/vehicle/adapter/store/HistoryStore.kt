package com.voicestorybook.vehicle.adapter.store

import com.voicestorybook.vehicle.adapter.LenientJson
import android.content.SharedPreferences
import com.voicestorybook.vehicle.core.listening.ListeningMark
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString

@Serializable private data class MarkDto(val renderId: String, val chapterIndex: Int, val positionMs: Long, val updatedAtMs: Long)

class HistoryStore(private val prefs: SharedPreferences) {
    fun load(): List<ListeningMark> {
        val raw = prefs.getString(KEY_HISTORY, null) ?: return emptyList()
        val dtos = try { LenientJson.decodeFromString<List<MarkDto>>(raw) } catch (e: SerializationException) { emptyList() }
        return dtos.map { ListeningMark(it.renderId, it.chapterIndex, it.positionMs, it.updatedAtMs) }
    }

    fun save(history: List<ListeningMark>) {
        val dtos = history.map { MarkDto(it.renderId, it.chapterIndex, it.positionMs, it.updatedAtMs) }
        prefs.edit().putString(KEY_HISTORY, LenientJson.encodeToString(dtos)).apply()
    }

    fun clear() = prefs.edit().remove(KEY_HISTORY).apply()
}

private const val KEY_HISTORY = "listening_history"
