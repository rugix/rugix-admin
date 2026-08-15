import { useState } from "react";
import type { api } from "../../generated";
import { ModalDialog } from "../../shared/components/ModalDialog";
import { Notice } from "../../shared/components/Notice";
import { Surface } from "../../shared/components/Surface";
import { Tooltip } from "../../shared/components/Tooltip";
import { buttonClass, primaryButtonClass } from "../../shared/styles";
import { UploadPanel } from "../install/UploadPanel";
import { BootGroups } from "./BootGroups";
import { SlotList } from "./SlotList";
import { StatePanel } from "./StatePanel";
import { StatusCell } from "./StatusCell";
import { SystemActionDialog } from "./SystemActionDialog";

type PendingSystemAction = {
  action: api.SystemAction;
  bootGroup?: string;
};

export function SystemPage({
  system,
  dangerouslyInsecure,
  features,
  onAction,
  onUpload,
  onUrlInstall,
  loading,
  busy,
}: {
  system?: api.SystemInfoResponse;
  dangerouslyInsecure: boolean;
  features?: api.DaemonFeatures;
  loading?: boolean;
  busy: boolean;
  onAction: (action: api.SystemAction, query?: api.SystemActionOptions) => void;
  onUpload: (file: File, options: api.SystemInstallOptions) => void;
  onUrlInstall: (url: string, options: api.SystemInstallOptions) => void;
}) {
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingSystemAction>();
  const boot = system?.boot;
  const slots = Object.entries(system?.slots ?? {}).filter(
    (entry): entry is [string, api.SystemSlotInfo] => entry[1] !== undefined,
  );
  const canCommit = features?.systemCommit === true && boot !== undefined;
  const canReboot = features?.systemReboot === true;
  const systemUncommitted =
    boot?.activeGroup !== undefined &&
    boot.defaultGroup !== undefined &&
    boot.activeGroup !== boot.defaultGroup;
  const commitIsPrimary = systemUncommitted && canCommit;

  return (
    <div className="space-y-3">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
        <h1 className="truncate font-display text-2xl font-semibold text-foreground">
          System
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {boot && systemUncommitted && (
            <Tooltip content="Commit the current system before installing another update.">
              <button
                className={buttonClass}
                aria-label="Install system update"
                disabled
              >
                Install update
              </button>
            </Tooltip>
          )}
          {boot && !systemUncommitted && (
            <button
              className={primaryButtonClass}
              aria-label="Install system update"
              title="Install system update"
              disabled={busy}
              onClick={() => setInstallDialogOpen(true)}
            >
              Install update
            </button>
          )}
          {commitIsPrimary && (
            <button
              className={primaryButtonClass}
              disabled={busy}
              onClick={() =>
                setPendingAction({
                  action: "commit",
                  bootGroup: boot?.activeGroup,
                })
              }
            >
              Commit
            </button>
          )}
        </div>
      </div>

      <Surface className="p-0">
        <div className="grid divide-y divide-divider sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <StatusCell
            label="Boot flow"
            value={boot?.bootFlow ?? "not configured"}
          />
          <StatusCell
            label="Current"
            value={bootGroupLabel(boot?.activeGroup)}
          />
          <StatusCell
            label="Default"
            value={bootGroupLabel(boot?.defaultGroup)}
          />
          <StatusCell label="State" value={stateLabel(system?.state)} />
        </div>
      </Surface>

      {!loading && system && !boot && (
        <Notice tone="warning">
          No boot flow is configured. System updates are unavailable on this
          device.
        </Notice>
      )}

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Surface title="System slots" bodyClassName="p-0">
          <SlotList
            slots={slots}
            loaded={system !== undefined}
            loading={loading}
          />
        </Surface>

        <div className="space-y-3 xl:sticky xl:top-24 xl:self-start">
          <StatePanel
            state={system?.state}
            loading={loading}
            canFactoryReset={features?.factoryReset === true}
            busy={busy}
            onFactoryReset={() =>
              setPendingAction({ action: "factory-reset" })
            }
          />
          <BootGroups
            boot={boot}
            canReboot={canReboot}
            busy={busy}
            onReboot={(action, bootGroup) =>
              setPendingAction({ action, bootGroup })
            }
          />
        </div>
      </div>

      {installDialogOpen && boot && (
        <ModalDialog
          title="Install system update"
          onClose={() => setInstallDialogOpen(false)}
        >
          <UploadPanel
            fileLabel="Update bundle"
            system
            allowUrl
            dangerouslyInsecure={dangerouslyInsecure}
            systemRebootEnabled={features?.systemReboot === true}
            onStarted={() => setInstallDialogOpen(false)}
            onUpload={onUpload}
            onUrlInstall={onUrlInstall}
            busy={busy}
          />
        </ModalDialog>
      )}

      {pendingAction && (
        <SystemActionDialog
          action={pendingAction.action}
          bootGroup={pendingAction.bootGroup}
          busy={busy}
          onClose={() => setPendingAction(undefined)}
          onApprove={(options) => {
            onAction(pendingAction.action, options);
            setPendingAction(undefined);
          }}
        />
      )}
    </div>
  );
}

function bootGroupLabel(group?: string) {
  return group ?? "unknown";
}

function stateLabel(state?: api.SystemStateInfo) {
  return state?.status.toLowerCase() ?? "unknown";
}
