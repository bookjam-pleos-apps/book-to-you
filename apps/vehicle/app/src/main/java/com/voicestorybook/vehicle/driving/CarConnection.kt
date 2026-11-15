package com.voicestorybook.vehicle.driving

import android.car.Car
import android.content.ComponentName
import android.content.Context
import android.content.ServiceConnection
import android.os.Build
import android.os.IBinder

// 차량 서비스에 기다리지 않고 붙는다. 콜백 createCar는 Android 11(API 30)부터 있고,
// 그 전(minSdk 28~29)에는 ServiceConnection + connect()뿐이다(AOSP car-lib android-9·10·11 Car.java 대조).
fun connectCar(context: Context, onReady: (Car) -> Unit, onLost: () -> Unit): Car {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        return Car.createCar(context, null, Car.CAR_WAIT_TIMEOUT_DO_NOT_WAIT) { car, ready ->
            if (ready) onReady(car) else onLost()
        }
    }
    return connectBeforeR(context, onReady, onLost)
}

@Suppress("DEPRECATION")
private fun connectBeforeR(context: Context, onReady: (Car) -> Unit, onLost: () -> Unit): Car {
    lateinit var car: Car
    val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) = onReady(car)
        override fun onServiceDisconnected(name: ComponentName?) = onLost()
    }
    car = Car.createCar(context, connection)
    car.connect()
    return car
}
