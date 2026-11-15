package com.voicestorybook.vehicle.adapter.store

import android.content.SharedPreferences
import com.voicestorybook.vehicle.core.pairing.PairedAccount

// 기기 토큰은 manifest와 오디오 읽기만 가능하다(서버 DEVICE_SCOPE). 앱 전용 저장소에 둔다.
// 계정 종류가 없는 토큰(종류를 적기 전에 저장된 것)은 본인 계정으로 본다.
class TokenStore(private val prefs: SharedPreferences) {
    fun load(): String? = prefs.getString(KEY_TOKEN, null)

    fun account(): PairedAccount =
        PairedAccount.entries.firstOrNull { it.name == prefs.getString(KEY_ACCOUNT, null) } ?: PairedAccount.Own

    fun save(token: String, account: PairedAccount) =
        prefs.edit().putString(KEY_TOKEN, token).putString(KEY_ACCOUNT, account.name).apply()

    fun clear() = prefs.edit().remove(KEY_TOKEN).remove(KEY_ACCOUNT).apply()
}

private const val KEY_TOKEN = "device_token"
private const val KEY_ACCOUNT = "device_account"
