import { ShieldAlert } from "lucide-react";

export function InsecureDaemonWarning() {
  return (
    <div
      className="rounded-lg border border-danger/40 bg-danger-surface px-4 py-3 text-danger shadow-elevation-plus-1"
      role="alert"
    >
      <div className="flex flex-wrap items-center gap-3">
        <ShieldAlert size={20} className="mt-0.5 shrink-0" />
        <div className="text-sm font-semibold">Rugix Ctrl security bypasses enabled</div>
        <div className="min-w-0 flex-1 text-sm leading-6">
          The privileged daemon allows callers to bypass Rugix Ctrl&apos;s security measures,
          including bundle verification and compatibility checks. This configuration is suitable
          only for development.
        </div>
        <a
          className="text-sm font-semibold underline underline-offset-4"
          href="https://github.com/rugix/rugix-admin#security-model"
          target="_blank"
          rel="noreferrer"
        >
          Security model
        </a>
      </div>
    </div>
  );
}
