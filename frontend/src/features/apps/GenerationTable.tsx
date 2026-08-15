import type { api } from "../../generated";
import { EmptyState } from "../../shared/components/EmptyState";
import { classes } from "../../shared/lib/classes";
import {
  compactTime,
  formatMetadata,
  generationLabel,
} from "../../shared/lib/format";
import {
  buttonClass,
  columnHeaderCellClass,
  columnHeaderClass,
} from "../../shared/styles";
import { GenerationStatusBadge } from "./GenerationStatusBadge";

export function GenerationTable({
  generations,
  onActivate,
  actionsDisabled,
}: {
  generations: api.AppGeneration[];
  onActivate?: (generation: api.AppGeneration["number"]) => void;
  actionsDisabled?: boolean;
}) {
  return (
    <>
      <table className="hidden min-w-full divide-y divide-divider text-sm lg:table">
        <thead className={columnHeaderClass}>
          <tr>
            <th className={columnHeaderCellClass} scope="col">
              Generation
            </th>
            <th className={columnHeaderCellClass} scope="col">
              Status
            </th>
            <th className={columnHeaderCellClass} scope="col">
              Created
            </th>
            <th className={columnHeaderCellClass} scope="col">
              Last Active
            </th>
            <th className={columnHeaderCellClass} scope="col">
              Metadata
            </th>
            {onActivate && (
              <th
                className={classes(columnHeaderCellClass, "text-right")}
                scope="col"
              >
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-divider">
          {generations.map((generation) => (
            <tr key={generation.number}>
              <td className="px-4 py-3 font-mono font-medium">
                {generationLabel(generation.number)}
              </td>
              <td className="px-4 py-3">
                <GenerationStatusBadge generation={generation} />
              </td>
              <td className="px-4 py-3 text-foreground-muted">
                {compactTime(generation.createdAt)}
              </td>
              <td className="px-4 py-3 text-foreground-muted">
                {generation.lastActivated
                  ? compactTime(generation.lastActivated)
                  : "never"}
              </td>
              <td className="px-4 py-3 text-foreground-muted">
                <GenerationMetadata metadata={generation.metadata} />
              </td>
              {onActivate && (
                <td className="px-4 py-3 text-right">
                  {!generation.active && generation.complete && (
                    <button
                      className={buttonClass}
                      disabled={actionsDisabled}
                      onClick={() => onActivate(generation.number)}
                    >
                      Activate
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="divide-y divide-divider lg:hidden" role="list">
        {generations.map((generation) => (
          <div
            className="space-y-3 px-4 py-3"
            key={generation.number}
            role="listitem"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium">
                  {generationLabel(generation.number)}
                </span>
                <GenerationStatusBadge generation={generation} />
              </div>
              {onActivate && !generation.active && generation.complete && (
                <button
                  className={buttonClass}
                  disabled={actionsDisabled}
                  onClick={() => onActivate(generation.number)}
                >
                  Activate
                </button>
              )}
            </div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
              <dt className="text-foreground-subtle">Created</dt>
              <dd className="text-right text-foreground-muted">
                {compactTime(generation.createdAt)}
              </dd>
              <dt className="text-foreground-subtle">Last active</dt>
              <dd className="text-right text-foreground-muted">
                {generation.lastActivated
                  ? compactTime(generation.lastActivated)
                  : "never"}
              </dd>
              <dt className="text-foreground-subtle">Metadata</dt>
              <dd className="min-w-0 text-right text-foreground-muted">
                <GenerationMetadata metadata={generation.metadata} />
              </dd>
            </dl>
          </div>
        ))}
      </div>

      {generations.length === 0 && <EmptyState label="No generations." />}
    </>
  );
}

function GenerationMetadata({ metadata }: { metadata: unknown }) {
  if (metadata === undefined || metadata === null) return <>none</>;
  return (
    <details className="inline-block text-left">
      <summary className="cursor-pointer font-medium text-primary hover:underline">
        View
      </summary>
      <pre className="mt-2 max-w-72 overflow-auto rounded-md bg-elevation-0 p-2 font-mono text-xs text-foreground">
        {formatMetadata(metadata)}
      </pre>
    </details>
  );
}
