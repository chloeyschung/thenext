"use client";

import { useEffect, useRef, useState } from "react";

import type { Participant, RankedCandidate } from "@/types/domain";

// 카카오 지도 SDK 는 전역 window.kakao 에 붙는다. MVP 범위에서 필요한 부분만 최소로 선언한다.
declare global {
  interface Window {
    kakao?: {
      maps: {
        load: (callback: () => void) => void;
        Map: new (container: HTMLElement, options: unknown) => KakaoMapInstance;
        LatLng: new (lat: number, lng: number) => unknown;
        LatLngBounds: new () => KakaoBounds;
        Marker: new (options: unknown) => { setMap: (map: unknown) => void };
        MarkerImage: new (src: string, size: unknown) => unknown;
        Size: new (width: number, height: number) => unknown;
        CustomOverlay: new (options: unknown) => { setMap: (map: unknown) => void };
      };
    };
  }
}

type KakaoMapInstance = { setBounds: (bounds: KakaoBounds) => void };
type KakaoBounds = { extend: (latlng: unknown) => void };

const SDK_ID = "kakao-maps-sdk";

type Props = {
  participants: Participant[];
  candidates: RankedCandidate[];
};

export function KakaoMap({ participants, candidates }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // SDK 가 이미 로드돼 있으면(같은 세션에서 결과 화면을 다시 열면) 곧바로 준비 완료로 시작한다.
  const [isReady, setIsReady] = useState(
    () => typeof window !== "undefined" && Boolean(window.kakao?.maps),
  );
  const [hasScriptError, setHasScriptError] = useState(false);

  const appKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  const hasError = !appKey || hasScriptError;

  // SDK 스크립트를 한 번만 주입한다.
  useEffect(() => {
    if (!appKey || window.kakao?.maps) return;

    const existing = document.getElementById(SDK_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");

    if (!existing) {
      script.id = SDK_ID;
      script.async = true;
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
      document.head.appendChild(script);
    }

    const handleLoad = () => window.kakao?.maps.load(() => setIsReady(true));
    const handleError = () => setHasScriptError(true);
    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);

    return () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };
  }, [appKey]);

  // 마커를 그리고, 전원과 후보가 모두 보이도록 화면을 맞춘다.
  useEffect(() => {
    if (!isReady || !containerRef.current || !window.kakao) return;

    const { maps } = window.kakao;
    const map = new maps.Map(containerRef.current, {
      center: new maps.LatLng(candidates[0]?.lat ?? 37.5665, candidates[0]?.lng ?? 126.978),
      level: 7,
    });

    const bounds = new maps.LatLngBounds();

    participants.forEach((participant) => {
      const position = new maps.LatLng(participant.lat, participant.lng);
      bounds.extend(position);
      new maps.Marker({ map, position, title: participant.name }).setMap(map);
      new maps.CustomOverlay({
        map,
        position,
        yAnchor: 2.2,
        content: `<div style="padding:2px 8px;border-radius:9999px;background:#fff;border:1px solid #d4d4d4;font-size:12px;white-space:nowrap">${escapeHtml(participant.name)}</div>`,
      }).setMap(map);
    });

    candidates.forEach((candidate, index) => {
      const position = new maps.LatLng(candidate.lat, candidate.lng);
      bounds.extend(position);
      new maps.CustomOverlay({
        map,
        position,
        content: `<div style="display:flex;align-items:center;gap:4px;padding:4px 10px;border-radius:9999px;background:#171717;color:#fff;font-size:13px;font-weight:600;white-space:nowrap"><span>${index + 1}</span><span>${escapeHtml(candidate.name)}</span></div>`,
      }).setMap(map);
    });

    map.setBounds(bounds);
  }, [isReady, participants, candidates]);

  if (hasError) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-neutral-300 text-sm text-neutral-500 dark:border-neutral-700">
        지도를 불러오지 못했어요. NEXT_PUBLIC_KAKAO_JS_KEY 설정을 확인해주세요.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-80 w-full rounded-lg border border-neutral-300 dark:border-neutral-700"
    />
  );
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char] ?? char,
  );
}
