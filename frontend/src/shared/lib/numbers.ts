import { Idx, U32, U64 } from "@sidex/types";

export function parseIdx(value: string): Idx | undefined {
  const number = Number(value);
  return value.trim() !== "" && Idx.is(number) ? number : undefined;
}

export function parseU32(value: string): U32 | undefined {
  const number = Number(value);
  return value.trim() !== "" && U32.is(number) ? number : undefined;
}

export function parseU64(value: string): U64 | undefined {
  const number = Number(value);
  return value.trim() !== "" && U64.is(number) ? number : undefined;
}
