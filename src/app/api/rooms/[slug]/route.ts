import { NextResponse } from "next/server";

import { getRoomBySlug, listParticipants } from "@/lib/db/queries";
import type { ParticipantSummary } from "@/types/domain";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const room = await getRoomBySlug(slug);

  if (!room) {
    return NextResponse.json(
      { message: "존재하지 않는 모임입니다." },
      { status: 404 },
    );
  }

  const participants = await listParticipants(room.id);

  // 방장 화면에는 누가 참여했는지만 필요하다. 좌표까지 내보내지 않는다.
  const summaries: ParticipantSummary[] = participants.map((participant) => ({
    id: participant.id,
    name: participant.name,
    addressLabel: participant.addressLabel,
    transportMode: participant.transportMode,
  }));

  return NextResponse.json({
    slug: room.slug,
    name: room.name,
    participants: summaries,
  });
}
