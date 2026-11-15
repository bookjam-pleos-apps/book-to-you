package com.voicestorybook.vehicle.ui.pairing

import android.graphics.Bitmap
import android.graphics.Color
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter

fun qrBitmap(content: String, sizePx: Int): Bitmap {
    val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx, mapOf(EncodeHintType.MARGIN to 1))
    val pixels = IntArray(sizePx * sizePx) { i -> if (matrix[i % sizePx, i / sizePx]) Color.BLACK else Color.WHITE }
    return Bitmap.createBitmap(pixels, sizePx, sizePx, Bitmap.Config.RGB_565)
}

// RFC 8628의 verification_uri_complete에 해당. 웹 화면이 코드를 미리 채울 수 있게 붙인다.
fun verificationLink(verificationUri: String, userCode: String): String = "$verificationUri?code=$userCode"

// 옮겨 적기 쉽게 4자리씩 끊어 보여 준다. 서버는 구분자를 무시한다(normalizeUserCode).
fun displayCode(userCode: String): String = userCode.chunked(4).joinToString("-")
