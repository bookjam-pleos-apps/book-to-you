package com.voicestorybook.vehicle.ui

import android.content.res.ColorStateList
import android.view.View
import android.widget.TextView
import androidx.annotation.ColorRes
import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.core.content.ContextCompat
import com.voicestorybook.vehicle.R
import com.voicestorybook.vehicle.core.shelf.CENTER_FOCUS
import com.voicestorybook.vehicle.core.shelf.CoverArt
import com.voicestorybook.vehicle.core.shelf.CoverFocus
import com.voicestorybook.vehicle.core.shelf.CoverShape
import com.voicestorybook.vehicle.core.shelf.CoverTone
import com.voicestorybook.vehicle.core.shelf.coverOf

// 앱에 넣은 표지 그림(res/drawable-nodpi, 글자 없음). 세로 3:4와 가로 16:9를 이야기 id로 둔다.
// 자리 비율과 같은 그림을 먼저 쓰고, 비율이 어긋나는 자리에서만 초점(CoverFocusTable)에 맞춰 자른다. 그림이 없는 이야기는 색 블록과 자리 표시로 보인다.
private val COVER_ART: Map<String, CoverArt> = mapOf(
    "redhood" to CoverArt(R.drawable.cover_redhood_portrait, R.drawable.cover_redhood_landscape),
    "fisherman" to CoverArt(R.drawable.cover_fisherman_portrait, R.drawable.cover_fisherman_landscape),
    "masteraway" to CoverArt(R.drawable.cover_masteraway_portrait, R.drawable.cover_masteraway_landscape),
)

private fun focusOf(view: View, @DrawableRes art: Int): CoverFocus =
    CoverFocusTable.of(view.context)[view.resources.getResourceEntryName(art)] ?: CENTER_FOCUS

@ColorRes
private fun colorOf(tone: CoverTone): Int = when (tone) {
    CoverTone.Red -> R.color.coverRed
    CoverTone.Sea -> R.color.coverSea
    CoverTone.Mint -> R.color.coverMint
}

// coverView는 layout/view_cover.xml을 include한 뷰다.
fun bindCover(coverView: View, storyId: String?, shape: CoverShape, @StringRes hint: Int = R.string.cover_placeholder) {
    val cover = coverOf(storyId.orEmpty())
    @DrawableRes val art: Int? = cover.artKey?.let(COVER_ART::get)?.pick(shape)
    val color = ContextCompat.getColor(coverView.context, colorOf(cover.tone))
    coverView.backgroundTintList = ColorStateList.valueOf(color)
    val image = coverView.findViewById<FocusCropImageView>(R.id.coverArt)
    image.visibility = if (art == null) View.GONE else View.VISIBLE
    art?.let { image.showArt(it, focusOf(image, it)) }
    coverView.findViewById<View>(R.id.coverPlaceholder).visibility = if (art == null) View.VISIBLE else View.GONE
    coverView.findViewById<TextView>(R.id.coverHint).setText(hint)
}
