package com.voicestorybook.vehicle.adapter.net

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network

// 기본 네트워크가 생길 때마다 알린다. 콜백은 메인이 아닌 스레드에서 오므로 받는 쪽이 스레드를 고른다.
class NetworkWatcher(context: Context) {
    private val connectivity = context.getSystemService(ConnectivityManager::class.java)

    fun onAvailable(action: () -> Unit) {
        connectivity.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = action()
        })
    }
}
