import { customAlphabet } from "nanoid";

/** 0/O, 1/l 처럼 헷갈리는 글자를 뺀 알파벳 — 링크를 눈으로 옮겨 적을 수도 있으므로 */
const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

export const generateSlug = customAlphabet(ALPHABET, 8);
