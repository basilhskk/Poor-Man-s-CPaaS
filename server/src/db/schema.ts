import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  routingStrategy: text("routing_strategy").notNull().default("least_load"), // least_load|round_robin
  healthCheckEnabled: boolean("health_check_enabled").notNull().default(true),
  webhookUrl: text("webhook_url"),
  webhookSecret: text("webhook_secret"),
  apiKey: text("api_key").unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const devices = pgTable("devices", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  apiKey: text("api_key").notNull().unique(),
  isPrimary: boolean("is_primary").notNull().default(false),
  lastSeen: timestamp("last_seen", { withTimezone: true }),
  lastAssignedAt: timestamp("last_assigned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const smsOutbound = pgTable(
  "sms_outbound",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id),
    recipient: text("recipient").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("pending"), // pending|sent|failed|dead_letter
    attempts: integer("attempts").notNull().default(0),
    webhookUrl: text("webhook_url"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("idx_outbound_status_created").on(t.status, t.createdAt)],
);

export const smsReceived = pgTable("sms_received", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  deviceId: uuid("device_id")
    .notNull()
    .references(() => devices.id),
  fromNumber: text("from_number").notNull(),
  body: text("body").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  webhookDelivered: boolean("webhook_delivered").notNull().default(false),
});
