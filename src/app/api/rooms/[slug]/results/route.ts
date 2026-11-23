import { NextResponse } from "next/server";

import { getRoomBySlug, listParticipants } from "@/lib/db/queries";
import { protectedResults } from "@/lib/protections/results";

// 현재 참여자 지문을 반영하는 DB 캐시/방별 lease를 페이지와 공유한다.
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

  const result = await protectedResults(room.id, participants);
  const { candidates } = result;
  return NextResponse.json({ ...result, candidates, participants }, {
    status: result.status === "busy" ? 409 : result.status === "unavailable" ? 503 : 200,
    headers: { "Cache-Control": "no-store", ...(result.status === "busy" ? { "Retry-After": "5" } : {}) },
  });
}
