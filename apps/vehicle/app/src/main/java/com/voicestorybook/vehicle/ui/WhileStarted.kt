package com.voicestorybook.vehicle.ui

import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

// 화면이 보이는 동안(STARTED)만 도는 작업. 가려지면 멈추고, 다시 보이면 처음부터 다시 돈다.
fun LifecycleOwner.whileStarted(block: suspend CoroutineScope.() -> Unit): Job =
    lifecycleScope.launch { repeatOnLifecycle(Lifecycle.State.STARTED, block) }
