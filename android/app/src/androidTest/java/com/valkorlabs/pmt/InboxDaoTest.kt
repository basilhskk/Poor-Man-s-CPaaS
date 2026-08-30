package com.valkorlabs.pmt

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.cash.turbine.test
import com.valkorlabs.pmt.data.db.AppDatabase
import com.valkorlabs.pmt.data.db.InboxDao
import com.valkorlabs.pmt.data.db.InboxMessage
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class InboxDaoTest {

    private lateinit var db: AppDatabase
    private lateinit var dao: InboxDao

    @Before fun setUp() {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(ctx, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        dao = db.inboxDao()
    }

    @After fun tearDown() = db.close()

    // ── insert ──────────────────────────────────────────────────────────────

    @Test fun insert_returns_generated_id() = runTest {
        val id = dao.insert(inbox(from = "+1"))
        assertTrue(id > 0)
    }

    @Test fun insert_stores_synced_false_by_default() = runTest {
        val id = dao.insert(inbox())
        val unsynced = dao.getUnsynced()
        assertEquals(1, unsynced.size)
        assertEquals(id, unsynced[0].id)
        assertFalse(unsynced[0].synced)
    }

    // ── getUnsynced ──────────────────────────────────────────────────────────

    @Test fun getUnsynced_excludes_already_synced() = runTest {
        val id = dao.insert(inbox())
        dao.markSynced(listOf(id))
        assertTrue(dao.getUnsynced().isEmpty())
    }

    @Test fun getUnsynced_returns_multiple_pending() = runTest {
        dao.insert(inbox(from = "+1"))
        dao.insert(inbox(from = "+2"))
        assertEquals(2, dao.getUnsynced().size)
    }

    @Test fun getUnsynced_orders_by_receivedAt_ascending() = runTest {
        dao.insert(inbox(from = "+late", receivedAt = 2_000L))
        dao.insert(inbox(from = "+early", receivedAt = 1_000L))
        val unsynced = dao.getUnsynced()
        assertEquals("+early", unsynced[0].from)
        assertEquals("+late", unsynced[1].from)
    }

    // ── markSynced ───────────────────────────────────────────────────────────

    @Test fun markSynced_only_marks_specified_ids() = runTest {
        val id1 = dao.insert(inbox(from = "+1"))
        val id2 = dao.insert(inbox(from = "+2"))
        dao.markSynced(listOf(id1))
        val unsynced = dao.getUnsynced()
        assertEquals(1, unsynced.size)
        assertEquals(id2, unsynced[0].id)
    }

    @Test fun markSynced_empty_list_changes_nothing() = runTest {
        dao.insert(inbox())
        dao.markSynced(emptyList())
        assertEquals(1, dao.getUnsynced().size)
    }

    // ── getAllFlow ────────────────────────────────────────────────────────────

    @Test fun getAllFlow_emits_on_insert() = runTest {
        dao.getAllFlow().test {
            assertEquals(0, awaitItem().size)
            dao.insert(inbox(from = "+1"))
            assertEquals(1, awaitItem().size)
            dao.insert(inbox(from = "+2"))
            assertEquals(2, awaitItem().size)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test fun getAllFlow_orders_by_receivedAt_descending() = runTest {
        dao.insert(inbox(from = "+early", receivedAt = 1_000L))
        dao.insert(inbox(from = "+late", receivedAt = 2_000L))
        dao.getAllFlow().test {
            val items = awaitItem()
            assertEquals("+late", items[0].from)
            assertEquals("+early", items[1].from)
            cancelAndIgnoreRemainingEvents()
        }
    }

    // ── getTotalCountFlow ────────────────────────────────────────────────────

    @Test fun getTotalCountFlow_counts_all_including_synced() = runTest {
        dao.getTotalCountFlow().test {
            assertEquals(0, awaitItem())
            val id = dao.insert(inbox())
            assertEquals(1, awaitItem())
            dao.markSynced(listOf(id))
            // count doesn't change after sync — synced = true, still in table
            expectNoEvents()
            cancelAndIgnoreRemainingEvents()
        }
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private fun inbox(
        from: String = "+0000000000",
        receivedAt: Long = System.currentTimeMillis()
    ) = InboxMessage(from = from, body = "hello", receivedAt = receivedAt)
}