package com.valkorlabs.pmt

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.valkorlabs.pmt.data.db.AppDatabase
import com.valkorlabs.pmt.data.db.InboxMessage
import com.valkorlabs.pmt.data.db.OutboxMessage
import com.valkorlabs.pmt.data.db.OutboxStatus
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Integration tests simulating the full message lifecycle driven by SmsGatewayService logic.
 * Exercises both DAOs together to verify correct state transitions.
 */
@RunWith(AndroidJUnit4::class)
class GatewayFlowTest {

    private lateinit var db: AppDatabase

    @Before fun setUp() {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(ctx, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After fun tearDown() = db.close()

    // ── outbox retry cycle ───────────────────────────────────────────────────

    @Test fun full_retry_cycle_ends_in_dead_letter() = runTest {
        val dao = db.outboxDao()
        val backoffs = longArrayOf(0L, 5 * 60_000L, 15 * 60_000L)
        val maxRetries = 3

        dao.insertAll(listOf(outbox("msg-1")))

        var now = 1_000L
        for (attempt in 0 until maxRetries) {
            val pending = dao.getPendingReady(now = now)
            assertEquals("attempt $attempt: expected 1 pending", 1, pending.size)

            val msg = pending[0]
            val nextAttempts = msg.attempts + 1

            if (nextAttempts >= maxRetries) {
                dao.updateStatus(msg.id, OutboxStatus.DEAD_LETTER.name, nextAttempts, 0L)
            } else {
                val backoffMs = backoffs.getOrElse(nextAttempts) { 15 * 60_000L }
                dao.updateStatus(msg.id, OutboxStatus.PENDING.name, nextAttempts, now + backoffMs)
                now += backoffMs + 1
            }
        }

        assertTrue(dao.getPendingReady(now = Long.MAX_VALUE).isEmpty())
        assertEquals(1, dao.getDlqFlow().first().size)
    }

    @Test fun dead_letter_requeue_makes_it_available_again() = runTest {
        val dao = db.outboxDao()
        dao.insertAll(listOf(outbox("msg-1", status = OutboxStatus.DEAD_LETTER.name, attempts = 3)))

        assertTrue(dao.getPendingReady(now = Long.MAX_VALUE).isEmpty())

        dao.requeueMessage("msg-1")

        val pending = dao.getPendingReady(now = 1L)
        assertEquals(1, pending.size)
        assertEquals(OutboxStatus.PENDING.name, pending[0].status)
        assertEquals(0, pending[0].attempts)
        assertEquals(0L, pending[0].nextRetryAt)
    }

    @Test fun requeue_all_restores_all_dlq_to_pending() = runTest {
        val dao = db.outboxDao()
        dao.insertAll(listOf(
            outbox("a", status = OutboxStatus.DEAD_LETTER.name, attempts = 3),
            outbox("b", status = OutboxStatus.DEAD_LETTER.name, attempts = 3),
            outbox("c", status = OutboxStatus.SENT.name)
        ))

        dao.requeueAll()

        val pending = dao.getPendingReady(now = Long.MAX_VALUE)
        assertEquals(2, pending.size)
        assertTrue(dao.getDlqFlow().first().isEmpty())
    }

    @Test fun server_uuid_dedup_prevents_double_send() = runTest {
        val dao = db.outboxDao()
        val msg = outbox("server-uuid-abc")
        dao.insertAll(listOf(msg))
        dao.insertAll(listOf(msg.copy(body = "duplicate from network retry")))

        val pending = dao.getPendingReady(now = Long.MAX_VALUE)
        assertEquals(1, pending.size)
        assertEquals("original body", pending[0].body)
    }

    // ── inbox offline buffering ──────────────────────────────────────────────

    @Test fun offline_messages_buffered_then_bulk_synced() = runTest {
        val dao = db.inboxDao()
        val id1 = dao.insert(inbox(from = "+1"))
        val id2 = dao.insert(inbox(from = "+2"))
        val id3 = dao.insert(inbox(from = "+3"))

        assertEquals(3, dao.getUnsynced().size)

        dao.markSynced(listOf(id1, id2, id3))

        assertTrue(dao.getUnsynced().isEmpty())
    }

    @Test fun partial_sync_leaves_failed_items_pending() = runTest {
        val dao = db.inboxDao()
        val id1 = dao.insert(inbox(from = "+1"))
        val id2 = dao.insert(inbox(from = "+2"))

        dao.markSynced(listOf(id1))

        val remaining = dao.getUnsynced()
        assertEquals(1, remaining.size)
        assertEquals(id2, remaining[0].id)
    }

    // ── combined ────────────────────────────────────────────────────────────

    @Test fun outbox_and_inbox_operations_are_isolated() = runTest {
        db.outboxDao().insertAll(listOf(outbox("o1")))
        val inboxId = db.inboxDao().insert(inbox(from = "+1"))

        db.inboxDao().markSynced(listOf(inboxId))

        assertEquals(1, db.outboxDao().getPendingReady(now = Long.MAX_VALUE).size)
        assertTrue(db.inboxDao().getUnsynced().isEmpty())
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private fun outbox(
        id: String,
        status: String = OutboxStatus.PENDING.name,
        attempts: Int = 0
    ) = OutboxMessage(
        id = id,
        recipient = "+0000000000",
        body = "original body",
        status = status,
        attempts = attempts,
        nextRetryAt = 0L
    )

    private fun inbox(from: String = "+0000000000") =
        InboxMessage(from = from, body = "hello", receivedAt = System.currentTimeMillis())
}
