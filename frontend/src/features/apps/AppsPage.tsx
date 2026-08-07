import { useState } from "react";
import { PackagePlus, Trash2 } from "lucide-react";
import type { AppActionOptions, InstallOptions } from "../../api";
import type { api } from "../../generated";
import { Badge } from "../../shared/components/Badge";
import { EmptyState } from "../../shared/components/EmptyState";
import { Surface } from "../../shared/components/Surface";
import { isNonNegativeInteger } from "../../shared/lib/numbers";
import { buttonClass, fieldClass } from "../../shared/styles";
import { UploadPanel } from "../install/UploadPanel";
import { AppDetailPanel } from "./AppDetailPanel";
import { AppInventory } from "./AppInventory";
import { GenerationTable } from "./GenerationTable";

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
  onSelect: (app: string) => void;
  onUpload: (file: File, options: InstallOptions) => void;
  onUrlInstall: (url: string, options: InstallOptions) => void;
  onAction: (action: api.AppAction, query?: AppActionOptions) => void;
  onGarbageCollect: (keep: number) => void;
  loading?: boolean;
  infoLoading?: boolean;
  busy: boolean;
}) {
  const appSummaries = apps ?? [];
  const [skipCompatibilityCheck, setSkipCompatibilityCheck] = useState(false);
  const [globalKeepGenerations, setGlobalKeepGenerations] = useState("1");
  const orderedGenerations = [...(info?.generations ?? [])].sort(
    (left, right) => Number(right.number) - Number(left.number),
  );
  const activeGeneration = orderedGenerations.find((generation) => generation.active);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <Surface
          title="Installed Apps"
          action={
            appLifecycleEnabled && (
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground-muted">Keep per app</span>
                  <span className="w-20 shrink-0">
                    <input
                      aria-label="Generations to keep for every app"
                      className={fieldClass}
                      type="number"
                      min="0"
                      step="1"
                      value={globalKeepGenerations}
                      onChange={(event) => setGlobalKeepGenerations(event.target.value)}
                    />
                  </span>
                </label>
                <button
                  className={buttonClass}
                  disabled={!isNonNegativeInteger(globalKeepGenerations) || busy}
                  onClick={() => onGarbageCollect(Number(globalKeepGenerations))}
                >
                  <Trash2 size={16} /> GC all
                </button>
              </div>
            )
          }
          bodyClassName="p-0"
        >
          <AppInventory
            apps={appSummaries}
            loaded={apps !== undefined}
            loading={loading}
            selected={selected?.name}
            onSelect={onSelect}
          />
        </Surface>

        <Surface
          title={selected ? <>Generations for <span className="font-mono">{selected.name}</span></> : "Generations"}
          action={info && <Badge color="bg-elevation-2 text-foreground-muted ring-divider" className="font-mono tabular-nums">{info.generations.length} total</Badge>}
          bodyClassName="p-0"
        >
          {info ? (
            <GenerationTable
              generations={orderedGenerations}
              onActivate={
                appLifecycleEnabled && !busy
                  ? (generation) =>
                      onAction("activate", {
                        generation,
                        skipCompatibilityCheck: skipCompatibilityCheck || undefined,
                      })
                  : undefined
              }
            />
          ) : (
            <EmptyState
              label={
                selected
                  ? infoLoading
                    ? "Application generations are loading."
                    : "Application generations are unavailable."
                  : "Select an app."
              }
            />
          )}
        </Surface>
      </div>

      <div className="space-y-5 xl:sticky xl:top-24 xl:self-start">
        <AppDetailPanel
          app={selected}
          info={info}
          activeGeneration={activeGeneration}
          lifecycleEnabled={appLifecycleEnabled}
          dangerouslyInsecure={dangerouslyInsecure}
          skipCompatibilityCheck={skipCompatibilityCheck}
          onSkipCompatibilityCheckChange={setSkipCompatibilityCheck}
          loading={infoLoading}
          busy={busy}
          onAction={onAction}
        />
        <UploadPanel
          title="Install App Bundle"
          fileLabel="App bundle"
          icon={<PackagePlus size={18} />}
          allowUrl
          dangerouslyInsecure={dangerouslyInsecure}
          onUpload={onUpload}
          onUrlInstall={onUrlInstall}
          busy={busy}
        />
      </div>
    </div>
  );
}
