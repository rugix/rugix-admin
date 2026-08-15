export function createJobId() {
  return globalThis.crypto.randomUUID();
}
