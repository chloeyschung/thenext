export type TransportMode = "transit" | "car";

export type LatLng = {
  lat: number;
  lng: number;
};

/** 카카오 장소 검색 결과를 화면에서 쓰기 좋게 정규화한 형태 */
export type PlaceSuggestion = LatLng & {
  /** 사용자에게 보여줄 장소명 (예: "강남역 2호선") */
  label: string;
  /** 보조 설명. 도로명 주소 등 */
  detail: string;
};

export type Participant = {
  id: string;
  name: string;
  addressLabel: string;
  lat: number;
  lng: number;
  transportMode: TransportMode;
};

/** 방장 화면 등 좌표를 노출하지 않아도 되는 곳에서 쓰는 축약형 */
export type ParticipantSummary = {
  id: string;
  name: string;
  addressLabel: string;
  transportMode: TransportMode;
};

export type Room = {
  slug: string;
  name: string | null;
  createdAt: string;
};

/** 중간지점 후보 (주로 지하철역) */
export type Candidate = LatLng & {
  name: string;
  /** 후보를 어떻게 찾았는지 — 폴백 여부를 UI에서 알려주기 위함 */
  source: "station" | "area" | "centroid";
};

export type ParticipantEta = {
  participantId: string;
  participantName: string;
  transportMode: TransportMode;
  /** 분 단위 */
  minutes: number;
  /** 실제 길찾기 API가 아니라 거리 기반 추정치로 계산된 경우 true */
  estimated: boolean;
};

export type RankedCandidate = Candidate & {
  etas: ParticipantEta[];
  /** 가장 오래 걸리는 사람의 소요시간 (분) — 랭킹 1순위 지표 */
  maxMinutes: number;
  /** 전원 소요시간 합 (분) — 동점 시 타이브레이크 */
  totalMinutes: number;
};

export type ResultsResponse = {
  candidates: RankedCandidate[];
  participants: Participant[];
};
