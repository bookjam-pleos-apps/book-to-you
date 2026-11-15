package com.voicestorybook.vehicle.ui

import android.content.Context
import android.graphics.Matrix
import android.graphics.drawable.Drawable
import android.util.AttributeSet
import androidx.annotation.DrawableRes
import androidx.appcompat.widget.AppCompatImageView
import com.voicestorybook.vehicle.core.shelf.CENTER_FOCUS
import com.voicestorybook.vehicle.core.shelf.CoverFocus
import com.voicestorybook.vehicle.core.shelf.PixelSize
import com.voicestorybook.vehicle.core.shelf.cropRegion

// 칸을 빈틈없이 채우되(centerCrop과 같은 배율) 자르는 위치는 표지 초점(core cropRegion)을 따른다.
class FocusCropImageView @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null) :
    AppCompatImageView(context, attrs) {

    // 부모 생성자가 setImageDrawable을 먼저 부르므로 초기값에 기대지 않고 null이면 가운데로 둔다.
    private var cropFocus: CoverFocus? = null

    init {
        scaleType = ScaleType.MATRIX
    }

    // 초점을 먼저 두고 그림을 넣는다. 그림을 넣을 때(setImageDrawable) 새 초점으로 한 번만 자른다.
    fun showArt(@DrawableRes art: Int, focus: CoverFocus) {
        cropFocus = focus
        setImageResource(art)
    }

    override fun setFrame(l: Int, t: Int, r: Int, b: Int): Boolean {
        val changed = super.setFrame(l, t, r, b)
        applyCrop()
        return changed
    }

    override fun setImageDrawable(drawable: Drawable?) {
        super.setImageDrawable(drawable)
        applyCrop()
    }

    private fun applyCrop() {
        val art = drawable ?: return
        val slotWidth = width - paddingLeft - paddingRight
        val slotHeight = height - paddingTop - paddingBottom
        if (art.intrinsicWidth <= 0 || art.intrinsicHeight <= 0 || slotWidth <= 0 || slotHeight <= 0) return
        val crop = cropRegion(
            PixelSize(art.intrinsicWidth.toDouble(), art.intrinsicHeight.toDouble()),
            PixelSize(slotWidth.toDouble(), slotHeight.toDouble()),
            cropFocus ?: CENTER_FOCUS,
        )
        val scale = (slotWidth / crop.width).toFloat()
        imageMatrix = Matrix().apply {
            setScale(scale, scale)
            postTranslate((-crop.left * scale).toFloat(), (-crop.top * scale).toFloat())
        }
    }
}
