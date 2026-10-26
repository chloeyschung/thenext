import { NextResponse } from "next/server";

import { addParticipant, getRoomBySlug } from "@/lib/db/queries";
import { addParticipantSchema } from "@/lib/validation";

export async function POST(
  request: Request,
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

  const body = await request.json().catch(() => null);
  const parsed = addParticipantSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요." },
      { status: 400 },
    );
  }

  const participant = await addParticipant({ roomId: room.id, ...parsed.data });
  return NextResponse.json({ id: participant.id }, { status: 201 });
}
