package com.voicestorybook.vehicle.ui

import android.content.Context
import com.voicestorybook.vehicle.core.shelf.CoverFocus
import com.voicestorybook.vehicle.core.shelf.decodeCoverFocus
import java.io.IOException

// 표지 초점 표. gpu/compose/cover-focus로 분석해 spike.run_cover_focus가 assets에 쓴 파일이다. 앱에 든 파일이라 한 번만 읽고,
// 없거나 읽을 수 없으면 빈 표(모두 가운데로 자르기)로 둔다.
private const val COVER_FOCUS_ASSET = "cover_focus.json"

object CoverFocusTable {
    @Volatile
    private var table: Map<String, CoverFocus>? = null

    fun of(context: Context): Map<String, CoverFocus> = table ?: read(context).also { table = it }

    private fun read(context: Context): Map<String, CoverFocus> = try {
        context.assets.open(COVER_FOCUS_ASSET).bufferedReader().use { decodeCoverFocus(it.readText()) }
    } catch (e: IOException) {
        emptyMap()
    }
}
