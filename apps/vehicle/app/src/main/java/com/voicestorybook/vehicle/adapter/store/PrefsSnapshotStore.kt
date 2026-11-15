package com.voicestorybook.vehicle.adapter.store

import android.content.SharedPreferences
import com.voicestorybook.vehicle.core.port.LibrarySnapshot
import com.voicestorybook.vehicle.core.port.SnapshotStore

class PrefsSnapshotStore(private val prefs: SharedPreferences) : SnapshotStore {
    override fun load(): LibrarySnapshot? {
        val body = prefs.getString(KEY_MANIFEST, null) ?: return null
        return LibrarySnapshot(body, prefs.getLong(KEY_SYNCED_AT, 0))
    }

    override fun save(snapshot: LibrarySnapshot) =
        prefs.edit().putString(KEY_MANIFEST, snapshot.manifestBody).putLong(KEY_SYNCED_AT, snapshot.syncedAtMs).apply()

    override fun clear() = prefs.edit().remove(KEY_MANIFEST).remove(KEY_SYNCED_AT).apply()
}

private const val KEY_MANIFEST = "manifest_body"
private const val KEY_SYNCED_AT = "manifest_synced_at"
