import { ShieldAlert } from "lucide-react";

export function DemoDisclaimer() {
  return (
    <div className="rounded-lg border border-warning/40 bg-warning-surface px-4 py-3 text-warning shadow-elevation-plus-1">
      <div className="flex flex-wrap items-center gap-3">
        <ShieldAlert size={20} className="mt-0.5 shrink-0" />
        <div className="text-sm font-semibold">Dangerously insecure mode enabled</div>
        <div className="min-w-0 flex-1 text-sm leading-6">
          Installations may bypass normal bundle verification. Do not expose this UI to untrusted users or networks.
        </div>
        <a className="text-sm font-semibold underline underline-offset-4" href="https://rugix.org" target="_blank" rel="noreferrer">
          rugix.org
        </a>
      </div>
    </div>
  );
}
