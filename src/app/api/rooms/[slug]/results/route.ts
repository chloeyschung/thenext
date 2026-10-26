import { NextResponse } from "next/server";

import { getRoomBySlug, listParticipants } from "@/lib/db/queries";
import { computeMidpoint } from "@/lib/midpoint/compute";

// 결과는 저장하지 않고 호출 시점의 참여자로 매번 새로 계산한다 (stale 데이터 방지).
export const dynamic = "force-dynamic";

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

  if (participants.length < 2) {
    return NextResponse.json(
      { message: "최소 2명이 출발지를 입력해야 중간지점을 찾을 수 있어요." },
      { status: 409 },
    );
  }

  const candidates = await computeMidpoint(participants);
  return NextResponse.json({ candidates, participants });
}
