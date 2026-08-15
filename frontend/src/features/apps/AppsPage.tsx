import { Plus } from "lucide-react";
import { useState } from "react";
import type { api } from "../../generated";
import { Badge } from "../../shared/components/Badge";
import { ModalDialog } from "../../shared/components/ModalDialog";
import { Surface } from "../../shared/components/Surface";
import { classes } from "../../shared/lib/classes";
import { buttonClass, primaryButtonClass } from "../../shared/styles";
import { UploadPanel } from "../install/UploadPanel";
import { AppActionDialog, type AppApprovalAction } from "./AppActionDialog";
import { AppDetails } from "./AppDetails";
import { AppInventory } from "./AppInventory";
import { GarbageCollectDialog } from "./GarbageCollectDialog";

type PendingAppAction = {
  app: string;
  action: AppApprovalAction;
  generation?: api.AppGeneration["number"];
};

export function AppsPage({
  apps,
  dangerouslyInsecure,
  appLifecycleEnabled,
  selected,
  info,
  onSelect,
  onUpload,
  onUrlInstall,
  onAction,
  onGarbageCollect,
  loading,
  infoLoading,
  busy,
}: {
  apps?: api.AppSummary[];
  dangerouslyInsecure: boolean;
  appLifecycleEnabled: boolean;
  selected?: api.AppSummary;
  info?: api.AppInfoResponse;
  onSelect: (app?: string) => void;
  onUpload: (file: File, options: api.SystemInstallOptions) => void;
  onUrlInstall: (url: string, options: api.SystemInstallOptions) => void;
  onAction: (
    app: string,
    action: api.AppAction,
    query?: api.AppActionOptions,
  ) => void;
  onGarbageCollect: (
    keep: NonNullable<api.AppGarbageCollectionOptions["keep"]>,
  ) => void;
  loading?: boolean;
  infoLoading?: boolean;
  busy: boolean;
}) {
  const appSummaries = apps ?? [];
  const selectedInfo = info?.name === selected?.name ? info : undefined;
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [allAppsGarbageCollectDialogOpen, setAllAppsGarbageCollectDialogOpen] =
    useState(false);
  const [appToGarbageCollect, setAppToGarbageCollect] = useState<string>();
  const [pendingAppAction, setPendingAppAction] = useState<PendingAppAction>();

  function selectApp(app?: string) {
    onSelect(app);
  }

  function approveAppAction(skipCompatibilityCheck: boolean) {
    if (!pendingAppAction) return;
    const options: api.AppActionOptions = {
      generation: pendingAppAction.generation,
      skipCompatibilityCheck: skipCompatibilityCheck || undefined,
    };
    onAction(pendingAppAction.app, pendingAppAction.action, options);
    setPendingAppAction(undefined);
  }

  return (
    <div className="space-y-3">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate font-display text-2xl font-semibold text-foreground">
            Installed Apps
          </h1>
          {apps && (
            <Badge
              color="bg-elevation-2 text-foreground-muted ring-divider"
              className="hidden font-mono tabular-nums sm:inline-flex"
            >
              {appSummaries.length} installed
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {appLifecycleEnabled && appSummaries.length > 0 && (
            <button
              className={buttonClass}
              aria-label="Garbage collect apps"
              title="Garbage collect apps"
              disabled={busy}
              onClick={() => setAllAppsGarbageCollectDialogOpen(true)}
            >
              <span className="sm:hidden">GC</span>
              <span className="hidden sm:inline">Garbage collect</span>
            </button>
          )}
          <button
            className={classes(primaryButtonClass, "max-sm:size-9 max-sm:px-0")}
            aria-label="Install app"
            title="Install app"
            disabled={busy}
            onClick={() => setInstallDialogOpen(true)}
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Install app</span>
          </button>
        </div>
      </div>

      <Surface bodyClassName="p-0">
        <AppInventory
          apps={appSummaries}
          loaded={apps !== undefined}
          loading={loading}
          selected={selected?.name}
          lifecycleEnabled={appLifecycleEnabled}
          busy={busy}
          onSelect={selectApp}
          onWorkloadAction={(app, action) => onAction(app, action)}
          onApprovalAction={(app, action) =>
            setPendingAppAction({ app, action })
          }
          onGarbageCollect={setAppToGarbageCollect}
          expandedContent={
            selected && (
              <AppDetails
                key={selected.name}
                app={selected}
                info={selectedInfo}
                lifecycleEnabled={appLifecycleEnabled}
                loading={infoLoading}
                busy={busy}
                onActivate={(generation) =>
                  setPendingAppAction({
                    app: selected.name,
                    action: "activate",
                    generation,
                  })
                }
              />
            )
          }
        />
      </Surface>

      {installDialogOpen && (
        <ModalDialog
          title="Install app"
          onClose={() => setInstallDialogOpen(false)}
        >
          <UploadPanel
            fileLabel="App bundle"
            allowUrl
            dangerouslyInsecure={dangerouslyInsecure}
            onStarted={() => setInstallDialogOpen(false)}
            onUpload={onUpload}
            onUrlInstall={onUrlInstall}
            busy={busy}
          />
        </ModalDialog>
      )}

      {allAppsGarbageCollectDialogOpen && (
        <GarbageCollectDialog
          title="Garbage collect apps"
          description="Remove older generations from every installed app. Choose how many previously active generations to retain for each app."
          inputLabel="Previous generations to keep per app"
          busy={busy}
          onClose={() => setAllAppsGarbageCollectDialogOpen(false)}
          onGarbageCollect={(keep) => {
            onGarbageCollect(keep);
            setAllAppsGarbageCollectDialogOpen(false);
          }}
        />
      )}

      {appToGarbageCollect && (
        <GarbageCollectDialog
          title={`Garbage collect ${appToGarbageCollect}`}
          description={`Remove older generations from ${appToGarbageCollect}. Choose how many previously active generations to retain.`}
          inputLabel="Previous generations to keep"
          busy={busy}
          onClose={() => setAppToGarbageCollect(undefined)}
          onGarbageCollect={(keep) => {
            onAction(appToGarbageCollect, "gc", { keep });
            setAppToGarbageCollect(undefined);
          }}
        />
      )}

      {pendingAppAction && (
        <AppActionDialog
          app={pendingAppAction.app}
          action={pendingAppAction.action}
          generation={pendingAppAction.generation}
          dangerouslyInsecure={dangerouslyInsecure}
          busy={busy}
          onClose={() => setPendingAppAction(undefined)}
          onApprove={approveAppAction}
        />
      )}
    </div>
  );
}
