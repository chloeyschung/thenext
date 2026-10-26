import { z } from "zod";

export const createRoomSchema = z.object({
  name: z.string().trim().max(100).optional().nullable(),
});

export const addParticipantSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력해주세요.").max(50),
  addressLabel: z.string().trim().min(1, "출발지를 선택해주세요.").max(200),
  // 한반도 주변 범위. 좌표를 뒤바꿔 보내는 실수를 조기에 잡는다.
  lat: z.number().min(33).max(39),
  lng: z.number().min(124).max(132),
  transportMode: z.enum(["transit", "car"]),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type AddParticipantInput = z.infer<typeof addParticipantSchema>;
