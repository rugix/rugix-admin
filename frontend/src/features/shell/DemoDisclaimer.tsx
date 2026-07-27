import { ShieldAlert } from "lucide-react";

export function DemoDisclaimer({
  dangerouslyInsecure,
  remoteAccess,
}: {
  dangerouslyInsecure: boolean;
  remoteAccess: boolean;
}) {
  return (
    <div className="rounded-lg border border-warning/40 bg-warning-surface px-4 py-3 text-warning shadow-elevation-plus-1">
      <div className="flex flex-wrap items-center gap-3">
        <ShieldAlert size={20} className="mt-0.5 shrink-0" />
        <div className="text-sm font-semibold">Development and demo use only</div>
        <div className="min-w-0 flex-1 text-sm leading-6">
          Rugix Admin has no authentication and can request privileged Rugix Ctrl operations.
          {remoteAccess && " Remote access is enabled; anyone who can reach this service can control the device."}
          {dangerouslyInsecure && " Bundle verification overrides are also enabled."}
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
