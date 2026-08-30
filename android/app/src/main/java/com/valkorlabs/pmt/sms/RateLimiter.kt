package com.valkorlabs.pmt.sms

import com.valkorlabs.pmt.Config
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class RateLimiter(
    private val config: Config,
    private val nowMs: () -> Long = System::currentTimeMillis
) {
    private val mutex = Mutex()
    private val timestamps = ArrayDeque<Long>()

    suspend fun acquire(): Boolean = mutex.withLock {
        val maxPerMinute = config.rateLimitPerMinute
        val now = nowMs()
        val windowStart = now - 60_000L
        while (timestamps.isNotEmpty() && timestamps.first() < windowStart) {
            timestamps.removeFirst()
        }
        if (timestamps.size < maxPerMinute) {
            timestamps.addLast(now)
            true
        } else {
            false
        }
    }

    suspend fun reset() = mutex.withLock { timestamps.clear() }
}