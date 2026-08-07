export function isNonNegativeInteger(value: string) {
  const number = Number(value);
  return value.trim() !== "" && Number.isSafeInteger(number) && number >= 0;
}
