import type { Idx, U32, U64 } from "@sidex/types";

export function parseIdx(value: string): Idx | undefined {
  const number = Number(value);
  return value.trim() !== "" && isIdx(number) ? number : undefined;
}

export function parseU32(value: string): U32 | undefined {
  const number = Number(value);
  return value.trim() !== "" && isU32(number) ? number : undefined;
}

export function parseU64(value: string): U64 | undefined {
  const number = Number(value);
  return value.trim() !== "" && isNumericU64(number) ? number : undefined;
}

function isIdx(value: number): value is Idx {
  return Number.isSafeInteger(value) && value >= 0;
}

function isU32(value: number): value is U32 {
  return Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff;
}

function isNumericU64(value: number): value is U64 & number {
  return Number.isSafeInteger(value) && value >= 0;
}
