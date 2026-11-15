package com.voicestorybook.vehicle.ui

import android.content.Context
import androidx.annotation.BoolRes
import com.voicestorybook.vehicle.core.shelf.CoverShape

// 같은 화면도 창 크기에 따라 세로·가로 표지를 쓴다. 어느 쪽인지는 창 크기 자원(bools)이 정한다.
fun windowCoverShape(context: Context, @BoolRes landscape: Int): CoverShape =
    if (context.resources.getBoolean(landscape)) CoverShape.Landscape else CoverShape.Portrait
