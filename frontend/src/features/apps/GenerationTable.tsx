import { Play } from "lucide-react";
import type { api } from "../../generated";
import { EmptyState } from "../../shared/components/EmptyState";
import { compactTime, generationLabel } from "../../shared/lib/format";
import { GenerationStatusBadge } from "../../shared/status/GenerationStatusBadge";
import { buttonClass } from "../../shared/styles";

export function GenerationTable({
  generations,
  onActivate,
}: {
  generations: api.AppGeneration[];
  onActivate?: (generation: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-divider text-sm">
        <thead className="bg-elevation-2 text-left text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          <tr>
            <th className="px-4 py-3">Generation</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Created</th>
            <th className="px-4 py-3">Last Active</th>
            {onActivate && <th className="px-4 py-3"></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-divider">
          {generations.map((generation) => (
            <tr key={generation.number} className="bg-elevation-1">
              <td className="px-4 py-3 font-mono font-medium">{generationLabel(generation.number)}</td>
              <td className="px-4 py-3">
                <GenerationStatusBadge generation={generation} />
              </td>
              <td className="px-4 py-3 text-foreground-muted">{compactTime(generation.createdAt)}</td>
              <td className="px-4 py-3 text-foreground-muted">
                {generation.lastActivated ? compactTime(generation.lastActivated) : "never"}
              </td>
              {onActivate && (
                <td className="px-4 py-3 text-right">
                  {!generation.active && generation.complete && (
                    <button
                      className={buttonClass}
                      onClick={() => onActivate(Number(generation.number))}
                    >
                      <Play size={16} /> Activate
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {generations.length === 0 && <EmptyState label="No generations." />}
    </div>
  );
}
