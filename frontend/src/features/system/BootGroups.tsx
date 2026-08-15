import { RotateCw } from "lucide-react";
import type { api } from "../../generated";
import { Badge } from "../../shared/components/Badge";
import { EmptyState } from "../../shared/components/EmptyState";
import { Surface } from "../../shared/components/Surface";
import { classes } from "../../shared/lib/classes";
import { iconButtonClass } from "../../shared/styles";

export function BootGroups({
  boot,
  canReboot,
  busy,
  onReboot,
}: {
  boot?: api.SystemBootInfo;
  canReboot: boolean;
  busy: boolean;
  onReboot: (action: api.SystemAction, bootGroup: string) => void;
}) {
  if (!boot) return null;
  const groups = Object.keys(boot.groups);
  const inactiveGroups = groups.filter((group) => group !== boot.activeGroup);

  return (
    <Surface title="Boot groups" bodyClassName="p-0">
      {groups.length > 0 ? (
        <div className="divide-y divide-divider">
          {groups.map((group) => {
            const rebootAction =
              group === boot.activeGroup
                ? "reboot"
                : inactiveGroups.length === 1
                  ? "reboot-spare"
                  : undefined;

            return (
              <div
                key={group}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="font-mono text-sm font-semibold">{group}</span>
                <div className="flex items-center gap-2">
                  {group === boot.activeGroup && (
                    <Badge color="bg-success-surface text-success ring-success/30">
                      active
                    </Badge>
                  )}
                  {group === boot.defaultGroup && (
                    <Badge color="bg-info-surface text-info ring-info/30">
                      default
                    </Badge>
                  )}
                  {canReboot && rebootAction && (
                    <button
                      className={classes(iconButtonClass, "size-8")}
                      aria-label={`Reboot into boot group ${group}`}
                      title={`Reboot into boot group ${group}`}
                      disabled={busy}
                      onClick={() => onReboot(rebootAction, group)}
                    >
                      <RotateCw aria-hidden="true" size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState label="No boot groups are configured." />
      )}
    </Surface>
  );
}
