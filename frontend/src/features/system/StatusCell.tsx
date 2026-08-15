export function StatusCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-base font-semibold">
        {value}
      </div>
    </div>
  );
}
