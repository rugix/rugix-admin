import {
  AlertTriangle,
  Check,
  Database,
  HardDrive,
  Layers3,
  Power,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import type { InstallOptions } from "../../api";
import type { api } from "../../generated";
import { ActionGroup } from "../../shared/components/ActionGroup";
import { Badge } from "../../shared/components/Badge";
import { EmptyState } from "../../shared/components/EmptyState";
import { Surface } from "../../shared/components/Surface";
import { confirmAction } from "../../shared/lib/confirm";
import { compactTime, formatBytes } from "../../shared/lib/format";
import { buttonClass, dangerButtonClass } from "../../shared/styles";
import { UploadPanel } from "../install/UploadPanel";
import { StatusCell } from "./StatusCell";

export function SystemPage({
  system,
  dangerouslyInsecure,
  features,
  onAction,
  onUpload,
  onUrlInstall,
}: {
  system?: api.SystemInfoResponse;
  dangerouslyInsecure: boolean;
  features?: api.DaemonFeatures;
  onAction: (action: string) => void;
  onUpload: (file: File, options: InstallOptions) => void;
  onUrlInstall: (url: string, options: InstallOptions) => void;
}) {
  const boot = system?.boot;
  const slots = Object.entries(system?.slots ?? {}).filter(
    (entry): entry is [string, api.SystemSlotInfo] => entry[1] !== undefined,
  );
  const hasBootActions = (features?.systemCommit === true && boot !== undefined) ||
    features?.systemReboot === true;
  const hasSystemActions = hasBootActions || features?.factoryReset === true;

  return (
    <div className="space-y-5">
      <Surface className="p-0">
        <div className="grid divide-y divide-divider sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <StatusCell label="Boot Flow" value={boot?.bootFlow ?? "not configured"} />
          <StatusCell label="Current" value={bootGroupLabel(boot?.activeGroup)} />
          <StatusCell label="Default" value={bootGroupLabel(boot?.defaultGroup)} />
          <StatusCell label="State" value={stateLabel(system?.state)} />
        </div>
      </Surface>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          {boot ? (
            <UploadPanel
              title="System Update"
              fileLabel="Update bundle"
              icon={<Upload size={18} />}
              system
              allowUrl
              dangerouslyInsecure={dangerouslyInsecure}
              systemRebootEnabled={features?.systemReboot === true}
              onUpload={onUpload}
              onUrlInstall={onUrlInstall}
            />
          ) : (
            <Surface title="System Updates" icon={<Upload size={18} />} bodyClassName="p-0">
              <EmptyState label="No boot flow is configured. System updates are unavailable on this device." />
            </Surface>
          )}

          <Surface title="System Slots" icon={<HardDrive size={18} />} bodyClassName="p-0">
            <SlotList slots={slots} />
          </Surface>
        </div>

        <div className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <StatePanel state={system?.state} />
          <BootGroups boot={boot} />

          {hasSystemActions && (
            <Surface title="System Actions">
              <div className="space-y-4">
                {hasBootActions && (
                  <ActionGroup title="Boot">
                    {boot && features?.systemCommit && (
                      <button className={buttonClass} onClick={() => onAction("commit")}>
                        <Check size={16} /> Commit
                      </button>
                    )}
                    {features?.systemReboot && (
                      <button className={buttonClass} onClick={() => onAction("reboot")}>
                        <Power size={16} /> Reboot
                      </button>
                    )}
                    {boot && features?.systemReboot && (
                      <button className={buttonClass} onClick={() => onAction("reboot-spare")}>
                        <RotateCcw size={16} /> Reboot Spare
                      </button>
                    )}
                  </ActionGroup>
                )}

                {features?.factoryReset && (
                  <ActionGroup title="Recovery">
                    <button
                      className={dangerButtonClass}
                      onClick={() => confirmAction("Factory reset?") && onAction("factory-reset")}
                    >
                      <Trash2 size={16} /> Factory Reset
                    </button>
                  </ActionGroup>
                )}
              </div>
            </Surface>
          )}
        </div>
      </div>
    </div>
  );
}

function StatePanel({ state }: { state?: api.SystemStateInfo }) {
  return (
    <Surface title="State Management" icon={<Database size={18} />}>
      {state ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground-muted">Status</span>
            <StateBadge state={state} />
          </div>
          <InfoRow
            label="Data partition"
            value={state.status === "Active" ? (state.dataPartition ?? "none") : "not available"}
          />
          {state.status === "Error" && (
            <Notice text="Persistent state is unavailable because state management encountered an error." />
          )}
          {state.status === "EphemeralFallback" && (
            <Notice text="The data partition failed to mount. State is temporarily stored in memory and will not persist." />
          )}
          {state.status === "Disabled" && (
            <p className="text-sm text-foreground-muted">Persistent state management is disabled.</p>
          )}
        </div>
      ) : (
        <div className="text-sm text-foreground-muted">System information is loading.</div>
      )}
    </Surface>
  );
}

function StateBadge({ state }: { state: api.SystemStateInfo }) {
  switch (state.status) {
    case "Active":
      return <Badge color="bg-success-surface text-success ring-success/30">active</Badge>;
    case "Disabled":
      return <Badge color="bg-elevation-2 text-foreground-muted ring-divider">disabled</Badge>;
    case "Error":
      return <Badge color="bg-danger-surface text-danger ring-danger/30">error</Badge>;
    case "EphemeralFallback":
      return <Badge color="bg-warning-surface text-warning ring-warning/30">ephemeral fallback</Badge>;
  }
}

function Notice({ text }: { text: string }) {
  return (
    <div className="flex gap-2 rounded-md bg-warning-surface p-3 text-sm text-warning">
      <AlertTriangle className="mt-0.5 shrink-0" size={16} />
      <span>{text}</span>
    </div>
  );
}

function BootGroups({ boot }: { boot?: api.SystemBootInfo }) {
  if (!boot) return null;
  const groups = Object.keys(boot.groups);

  return (
    <Surface title="Boot Groups" icon={<Layers3 size={18} />} bodyClassName="p-0">
      {groups.length > 0 ? (
        <div className="divide-y divide-divider">
          {groups.map((group) => (
            <div key={group} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="font-mono text-sm font-semibold">{group}</span>
              <div className="flex gap-2">
                {group === boot.activeGroup && (
                  <Badge color="bg-success-surface text-success ring-success/30">active</Badge>
                )}
                {group === boot.defaultGroup && (
                  <Badge color="bg-info-surface text-info ring-info/30">default</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState label="No boot groups are configured." />
      )}
    </Surface>
  );
}

function SlotList({ slots }: { slots: Array<[string, api.SystemSlotInfo]> }) {
  if (slots.length === 0) {
    return <EmptyState label="No system slots are configured." />;
  }

  return (
    <div className="divide-y divide-divider">
      {slots.map(([name, slot]) => {
        const hashes = Object.entries(slot.hashes ?? {});
        return (
          <div key={name} className="space-y-3 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm font-semibold">{name}</span>
              {slot.active === true && (
                <Badge color="bg-success-surface text-success ring-success/30">active</Badge>
              )}
              {slot.active === false && (
                <Badge color="bg-elevation-2 text-foreground-muted ring-divider">inactive</Badge>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow
                label="Stored size"
                value={slot.size === undefined ? "unknown" : formatBytes(Number(slot.size))}
              />
              <InfoRow label="Last updated" value={slot.updatedAt ? compactTime(slot.updatedAt) : "unknown"} />
            </div>
            {hashes.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">Hashes</div>
                <div className="mt-2 space-y-1.5">
                  {hashes.map(([algorithm, hash]) => (
                    <div key={algorithm} className="grid gap-1 rounded-md bg-elevation-2 px-2.5 py-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-3">
                      <span className="font-mono text-xs font-semibold text-foreground-muted">{algorithm}</span>
                      <span className="break-all font-mono text-xs">{hash}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">{label}</div>
      <div className="mt-1 break-all font-mono text-sm">{value}</div>
    </div>
  );
}

function bootGroupLabel(group?: string) {
  return group?.toUpperCase() ?? "unknown";
}

function stateLabel(state?: api.SystemStateInfo) {
  if (!state) return "unknown";
  return state.status === "EphemeralFallback" ? "ephemeral" : state.status.toLowerCase();
}
