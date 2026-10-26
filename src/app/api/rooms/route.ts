import { NextResponse } from "next/server";

import { createRoom } from "@/lib/db/queries";
import { createRoomSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = createRoomSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: "모임 이름을 확인해주세요." },
      { status: 400 },
    );
  }

  const room = await createRoom(parsed.data.name?.trim() || null);
  return NextResponse.json({ slug: room.slug }, { status: 201 });
}
