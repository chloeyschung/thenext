import { asc, eq } from "drizzle-orm";

import type { Participant, TransportMode } from "@/types/domain";

import { db } from "./client";
import { generateSlug } from "../slug";
import { participants, rooms, type ParticipantRow, type RoomRow } from "./schema";

/**
 * 방 생성. slug 는 고유 제약이 걸려 있어 아주 드물게 충돌할 수 있으므로 몇 번 재시도한다.
 */
export async function createRoom(name: string | null): Promise<RoomRow> {
  const MAX_ATTEMPTS = 5;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const [row] = await db
        .insert(rooms)
        .values({ slug: generateSlug(), name })
        .returning();
      return row;
    } catch (error) {
      const isDuplicate =
        error instanceof Error && /duplicate key|unique/i.test(error.message);
      if (!isDuplicate || attempt === MAX_ATTEMPTS - 1) throw error;
    }
  }

  throw new Error("방 생성에 실패했습니다.");
}

export async function getRoomBySlug(slug: string): Promise<RoomRow | null> {
  const [row] = await db.select().from(rooms).where(eq(rooms.slug, slug)).limit(1);
  return row ?? null;
}

export async function listParticipants(roomId: string): Promise<Participant[]> {
  const rows = await db
    .select()
    .from(participants)
    .where(eq(participants.roomId, roomId))
    .orderBy(asc(participants.createdAt));

  return rows.map(toParticipant);
}

export async function addParticipant(input: {
  roomId: string;
  name: string;
  addressLabel: string;
  lat: number;
  lng: number;
  transportMode: TransportMode;
}): Promise<Participant> {
  const [row] = await db.insert(participants).values(input).returning();
  return toParticipant(row);
}

function toParticipant(row: ParticipantRow): Participant {
  return {
    id: row.id,
    name: row.name,
    addressLabel: row.addressLabel,
    lat: row.lat,
    lng: row.lng,
    transportMode: row.transportMode as TransportMode,
  };
}
