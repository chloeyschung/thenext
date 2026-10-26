import {
  doublePrecision,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** URL에 노출되는 짧은 토큰. 이 값이 곧 방의 접근 권한이다. */
  slug: varchar("slug", { length: 12 }).notNull().unique(),
  name: varchar("name", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 50 }).notNull(),
    /** 카카오에서 받아온 장소명 그대로 저장 (사용자가 고른 표현을 보존) */
    addressLabel: varchar("address_label", { length: 200 }).notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    transportMode: varchar("transport_mode", { length: 10 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("participants_room_id_idx").on(table.roomId)],
);

export type RoomRow = typeof rooms.$inferSelect;
export type ParticipantRow = typeof participants.$inferSelect;
