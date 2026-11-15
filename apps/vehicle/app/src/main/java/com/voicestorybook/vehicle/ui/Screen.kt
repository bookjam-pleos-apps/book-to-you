package com.voicestorybook.vehicle.ui

// MainActivity가 한 번에 하나만 띄우는 화면. 정차 여부가 바뀌면 화면이 스스로 막을 조작을 정한다.
interface Screen {
    fun setParked(parked: Boolean)
    fun release()
}
