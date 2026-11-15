package com.voicestorybook.vehicle.ui.player

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View
import androidx.core.content.ContextCompat
import com.voicestorybook.vehicle.R
import com.voicestorybook.vehicle.core.playback.ChapterProgress

// 장마다 한 칸인 진행 막대. 칸 사이를 띄워 "몇 장 중 몇 장째"를 막대만 보고도 알게 한다.
// 칸 채움은 core의 ChapterProgress가 정하고, 이 뷰는 그리기만 한다.
class ChapterProgressView @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private val trackPaint = paintOf(R.color.progressTrack)
    private val fillPaint = paintOf(R.color.brand)
    private val gap = resources.getDimension(R.dimen.chapterGap)
    private val cell = RectF()
    private var progress = ChapterProgress(chapterIndex = 0, withinChapter = 0f, chapterCount = 0)

    fun show(next: ChapterProgress) {
        if (next == progress) return
        progress = next
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val count = progress.chapterCount
        if (count == 0) return
        val cellWidth = (width - gap * (count - 1)) / count
        if (cellWidth <= 0f) return
        (0 until count).forEach { index -> drawCell(canvas, index * (cellWidth + gap), cellWidth, progress.fillOf(index)) }
    }

    // 둥근 끝이 찌그러지지 않게 채움은 최소 높이만큼 그리되, 칸 폭은 넘지 않는다.
    private fun drawCell(canvas: Canvas, left: Float, cellWidth: Float, fill: Float) {
        val radius = height / 2f
        cell.set(left, 0f, left + cellWidth, height.toFloat())
        canvas.drawRoundRect(cell, radius, radius, trackPaint)
        if (fill <= 0f) return
        cell.right = left + maxOf(cellWidth * fill, minOf(height.toFloat(), cellWidth))
        canvas.drawRoundRect(cell, radius, radius, fillPaint)
    }

    private fun paintOf(color: Int) = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = ContextCompat.getColor(context, color) }
}
