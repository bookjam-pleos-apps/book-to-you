package com.voicestorybook.vehicle.ui.player

import android.content.Context
import com.voicestorybook.vehicle.R
import com.voicestorybook.vehicle.core.shelf.CoverShape
import com.voicestorybook.vehicle.ui.windowCoverShape

// 재생 화면 표지 모양은 창 크기 자원(bools playerCoverLandscape)이 정한다. 키 큰 분할 창만 가로 그림이다.
fun playerCoverShape(context: Context): CoverShape = windowCoverShape(context, R.bool.playerCoverLandscape)
