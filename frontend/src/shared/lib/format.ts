export function compactTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function generationLabel(value: unknown) {
  return value === undefined || value === null ? "none" : `#${String(value)}`;
}

export function formatMetadata(metadata: unknown) {
  if (typeof metadata === "string") return metadata;
  return JSON.stringify(metadata, null, 2) ?? String(metadata);
}
