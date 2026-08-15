import { ShieldAlert } from "lucide-react";

export function InsecureDaemonWarning() {
  return (
    <div
      className="rounded-lg border border-danger/40 bg-danger-surface px-4 py-3"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert aria-hidden="true" size={20} className="mt-0.5 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-danger">
            Rugix Ctrl security bypasses enabled
          </div>
          <p className="mt-1 text-sm leading-5 text-foreground">
            The privileged daemon lets callers bypass bundle verification and compatibility checks.
            This configuration is suitable only for development.{" "}
            <a
              className="whitespace-nowrap font-semibold text-danger underline underline-offset-4"
              href="https://rugix.org/docs/admin/security/"
              target="_blank"
              rel="noreferrer"
            >
              Security model
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
