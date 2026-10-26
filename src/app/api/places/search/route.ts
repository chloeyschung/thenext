import { NextResponse } from "next/server";

import { searchPlaces } from "@/lib/kakao/local";

/** 카카오 REST 키를 브라우저에 노출하지 않기 위한 서버 프록시 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json({ places: [] });
  }

  try {
    const places = await searchPlaces(query);
    return NextResponse.json({ places });
  } catch (error) {
    console.error("장소 검색 실패:", error);
    return NextResponse.json(
      { message: "장소 검색에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 502 },
    );
  }
}
