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
  homeAddressLabel: z.string().trim().min(1, "귀가지를 선택해주세요.").max(200).optional(),
  homeLat: z.number().min(33).max(39).optional(),
  homeLng: z.number().min(124).max(132).optional(),
  returnTransportMode: z.enum(["transit", "car"]).optional(),
}).superRefine((input, ctx) => {
  const fields = [input.homeAddressLabel, input.homeLat, input.homeLng];
  if (fields.some((v) => v !== undefined) && fields.some((v) => v === undefined)) {
    ctx.addIssue({ code: "custom", message: "귀가지 주소와 좌표를 모두 선택해주세요." });
  }
}).transform((input) => ({
  ...input,
  homeAddressLabel: input.homeAddressLabel ?? input.addressLabel,
  homeLat: input.homeLat ?? input.lat,
  homeLng: input.homeLng ?? input.lng,
  returnTransportMode: input.returnTransportMode ?? input.transportMode,
}));

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type AddParticipantInput = z.infer<typeof addParticipantSchema>;
