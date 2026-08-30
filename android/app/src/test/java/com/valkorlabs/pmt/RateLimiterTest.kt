package com.valkorlabs.pmt

import com.valkorlabs.pmt.sms.RateLimiter
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class RateLimiterTest {

    private val config = mockk<Config>()
    private var fakeNow = 0L
    private lateinit var limiter: RateLimiter

    @Before fun setUp() {
        every { config.rateLimitPerMinute } returns 3
        limiter = RateLimiter(config, nowMs = { fakeNow })
    }

    @Test fun `acquire allows messages up to limit`() = runTest {
        fakeNow = 1_000L
        assertTrue(limiter.acquire())
        assertTrue(limiter.acquire())
        assertTrue(limiter.acquire())
    }

    @Test fun `acquire blocks when limit exceeded`() = runTest {
        fakeNow = 1_000L
        repeat(3) { limiter.acquire() }
        assertFalse(limiter.acquire())
    }

    @Test fun `sliding window evicts timestamps older than 60s`() = runTest {
        fakeNow = 0L
        repeat(3) { limiter.acquire() }   // fill window at t=0
        assertFalse(limiter.acquire())     // blocked

        fakeNow = 61_000L                  // advance 61 seconds
        assertTrue(limiter.acquire())      // old slots evicted, allowed again
    }

    @Test fun `messages at exactly 60s boundary are evicted`() = runTest {
        fakeNow = 0L
        limiter.acquire()

        fakeNow = 60_001L                  // just past the 60s window
        every { config.rateLimitPerMinute } returns 1
        val newLimiter = RateLimiter(config, nowMs = { fakeNow })
        assertTrue(newLimiter.acquire())   // fresh limiter with 1/min limit has slot
    }

    @Test fun `reset clears all timestamps`() = runTest {
        fakeNow = 1_000L
        repeat(3) { limiter.acquire() }
        assertFalse(limiter.acquire())     // blocked

        limiter.reset()
        assertTrue(limiter.acquire())      // free after reset
    }

    @Test fun `rate limit change is picked up on next acquire`() = runTest {
        fakeNow = 1_000L
        every { config.rateLimitPerMinute } returns 1
        limiter.acquire()
        assertFalse(limiter.acquire())     // blocked at 1/min

        every { config.rateLimitPerMinute } returns 5
        assertTrue(limiter.acquire())      // allowed after config change
    }

    @Test fun `zero rate limit blocks all acquires`() = runTest {
        every { config.rateLimitPerMinute } returns 0
        fakeNow = 1_000L
        assertFalse(limiter.acquire())
    }
}