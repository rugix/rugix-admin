import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function classes(...values: ClassValue[]) {
  return twMerge(clsx(values));
}
