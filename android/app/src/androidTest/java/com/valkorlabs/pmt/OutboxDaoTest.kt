package com.valkorlabs.pmt

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.cash.turbine.test
import com.valkorlabs.pmt.data.db.AppDatabase
import com.valkorlabs.pmt.data.db.OutboxDao
import com.valkorlabs.pmt.data.db.OutboxMessage
import com.valkorlabs.pmt.data.db.OutboxStatus
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OutboxDaoTest {

    private lateinit var db: AppDatabase
    private lateinit var dao: OutboxDao

    @Before fun setUp() {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(ctx, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        dao = db.outboxDao()
    }

    @After fun tearDown() = db.close()

    // ── insert ──────────────────────────────────────────────────────────────

    @Test fun insertAll_deduplicates_by_id() = runTest {
        val msg = outbox("id-1")
        dao.insertAll(listOf(msg, msg.copy(body = "different")))
        val pending = dao.getPendingReady(now = Long.MAX_VALUE)
        assertEquals(1, pending.size)
        assertEquals("original", pending[0].body)
    }

    // ── getPendingReady ──────────────────────────────────────────────────────

    @Test fun getPendingReady_returns_message_with_zero_nextRetryAt() = runTest {
        dao.insertAll(listOf(outbox("1", nextRetryAt = 0L)))
        val result = dao.getPendingReady(now = 1_000L)
        assertEquals(1, result.size)
    }

    @Test fun getPendingReady_skips_message_with_future_nextRetryAt() = runTest {
        dao.insertAll(listOf(outbox("1", nextRetryAt = 5_000L)))
        val result = dao.getPendingReady(now = 1_000L)
        assertTrue(result.isEmpty())
    }

    @Test fun getPendingReady_returns_message_once_backoff_elapsed() = runTest {
        dao.insertAll(listOf(outbox("1", nextRetryAt = 5_000L)))
        assertTrue(dao.getPendingReady(now = 4_999L).isEmpty())
        assertEquals(1, dao.getPendingReady(now = 5_000L).size)
    }

    @Test fun getPendingReady_excludes_sent_and_dlq() = runTest {
        dao.insertAll(listOf(
            outbox("sent", status = OutboxStatus.SENT.name),
            outbox("dlq", status = OutboxStatus.DEAD_LETTER.name),
            outbox("pending")
        ))
        val result = dao.getPendingReady(now = Long.MAX_VALUE)
        assertEquals(1, result.size)
        assertEquals("pending", result[0].id)
    }

    @Test fun getPendingReady_orders_by_createdAt_ascending() = runTest {
        dao.insertAll(listOf(
            outbox("new", createdAt = 2_000L),
            outbox("old", createdAt = 1_000L)
        ))
        val result = dao.getPendingReady(now = Long.MAX_VALUE)
        assertEquals("old", result[0].id)
        assertEquals("new", result[1].id)
    }

    // ── updateStatus ────────────────────────────────────────────────────────

    @Test fun updateStatus_to_SENT() = runTest {
        dao.insertAll(listOf(outbox("1")))
        dao.updateStatus("1", OutboxStatus.SENT.name, attempts = 1, nextRetryAt = 0L)
        val result = dao.getPendingReady(now = Long.MAX_VALUE)
        assertTrue(result.isEmpty())
    }

    @Test fun updateStatus_to_DEAD_LETTER() = runTest {
        dao.insertAll(listOf(outbox("1")))
        dao.updateStatus("1", OutboxStatus.DEAD_LETTER.name, attempts = 3, nextRetryAt = 0L)
        dao.getDlqFlow().test {
            val dlq = awaitItem()
            assertEquals(1, dlq.size)
            assertEquals(3, dlq[0].attempts)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test fun updateStatus_sets_backoff_nextRetryAt() = runTest {
        dao.insertAll(listOf(outbox("1")))
        dao.updateStatus("1", OutboxStatus.PENDING.name, attempts = 1, nextRetryAt = 9_999L)
        assertTrue(dao.getPendingReady(now = 9_998L).isEmpty())
        assertEquals(1, dao.getPendingReady(now = 9_999L).size)
    }

    // ── requeue ─────────────────────────────────────────────────────────────

    @Test fun requeueMessage_resets_single_message() = runTest {
        dao.insertAll(listOf(outbox("1", status = OutboxStatus.DEAD_LETTER.name, attempts = 3)))
        dao.requeueMessage("1")
        val result = dao.getPendingReady(now = 1L)
        assertEquals(1, result.size)
        assertEquals(OutboxStatus.PENDING.name, result[0].status)
        assertEquals(0, result[0].attempts)
        assertEquals(0L, result[0].nextRetryAt)
    }

    @Test fun requeueAll_resets_all_dead_letter_messages() = runTest {
        dao.insertAll(listOf(
            outbox("a", status = OutboxStatus.DEAD_LETTER.name, attempts = 3),
            outbox("b", status = OutboxStatus.DEAD_LETTER.name, attempts = 3),
            outbox("c", status = OutboxStatus.SENT.name)
        ))
        dao.requeueAll()
        val pending = dao.getPendingReady(now = Long.MAX_VALUE)
        assertEquals(2, pending.size)
        assertTrue(pending.all { it.status == OutboxStatus.PENDING.name && it.attempts == 0 })
    }

    @Test fun requeueAll_does_not_touch_sent_messages() = runTest {
        dao.insertAll(listOf(outbox("sent", status = OutboxStatus.SENT.name)))
        dao.requeueAll()
        val pending = dao.getPendingReady(now = Long.MAX_VALUE)
        assertTrue(pending.isEmpty())
    }

    // ── count flows ─────────────────────────────────────────────────────────

    @Test fun pendingCountFlow_reflects_state() = runTest {
        dao.getPendingCountFlow().test {
            assertEquals(0, awaitItem())
            dao.insertAll(listOf(outbox("1"), outbox("2")))
            assertEquals(2, awaitItem())
            dao.updateStatus("1", OutboxStatus.SENT.name, 0, 0L)
            assertEquals(1, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test fun dlqCountFlow_reflects_state() = runTest {
        dao.getDlqCountFlow().test {
            assertEquals(0, awaitItem())
            dao.insertAll(listOf(outbox("1", status = OutboxStatus.DEAD_LETTER.name)))
            assertEquals(1, awaitItem())
            dao.requeueAll()
            assertEquals(0, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private fun outbox(
        id: String,
        status: String = OutboxStatus.PENDING.name,
        attempts: Int = 0,
        nextRetryAt: Long = 0L,
        createdAt: Long = System.currentTimeMillis()
    ) = OutboxMessage(
        id = id,
        recipient = "+1234567890",
        body = "original",
        status = status,
        createdAt = createdAt,
        attempts = attempts,
        nextRetryAt = nextRetryAt
    )
}