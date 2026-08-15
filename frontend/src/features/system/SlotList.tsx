import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import type { api } from "../../generated";
import { Badge } from "../../shared/components/Badge";
import { EmptyState } from "../../shared/components/EmptyState";
import { classes } from "../../shared/lib/classes";
import { compactTime, formatBytes } from "../../shared/lib/format";

export function SlotList({
  slots,
  loaded,
  loading,
}: {
  slots: Array<[string, api.SystemSlotInfo]>;
  loaded: boolean;
  loading?: boolean;
}) {
  const inventoryId = useId();
  const [expandedSlot, setExpandedSlot] = useState<string>();

  if (!loaded) {
    return (
      <EmptyState
        label={
          loading
            ? "System slots are loading."
            : "System slots are unavailable."
        }
      />
    );
  }
  if (slots.length === 0) {
    return <EmptyState label="No system slots are configured." />;
  }

  return (
    <div>
      <div className="hidden gap-3 border-b border-divider bg-elevation-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-foreground-subtle md:grid md:grid-cols-[minmax(0,1fr)_100px_110px_180px]">
        <span>Slot</span>
        <span>Status</span>
        <span>Size</span>
        <span>Updated</span>
      </div>
      <div className="divide-y divide-divider">
        {slots.map(([name, slot], index) => {
          const expanded = expandedSlot === name;
          const detailsId = `${inventoryId}-slot-${index}`;
          return (
            <div key={name}>
              <button
                className={classes(
                  "grid w-full grid-cols-1 items-center gap-3 px-4 py-3 text-left transition hover:bg-elevation-2",
                  "md:grid-cols-[minmax(0,1fr)_100px_110px_180px]",
                  expanded && "bg-primary-muted",
                )}
                onClick={() => setExpandedSlot(expanded ? undefined : name)}
                aria-label={name}
                aria-expanded={expanded}
                aria-controls={detailsId}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <ChevronRight
                    aria-hidden="true"
                    size={16}
                    className={classes(
                      "shrink-0 text-foreground-subtle transition",
                      expanded && "rotate-90",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-sm font-semibold">
                      {name}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 md:hidden">
                      <SlotStatus active={slot.active} />
                      <span className="font-mono text-xs text-foreground-muted">
                        {slot.size === undefined
                          ? "unknown"
                          : formatBytes(Number(slot.size))}
                      </span>
                      <span className="text-xs text-foreground-muted">
                        {slot.updatedAt
                          ? compactTime(slot.updatedAt)
                          : "unknown"}
                      </span>
                    </span>
                  </span>
                </span>
                <span className="hidden md:block">
                  <SlotStatus active={slot.active} />
                </span>
                <span className="hidden font-mono text-sm text-foreground-muted md:block">
                  {slot.size === undefined
                    ? "unknown"
                    : formatBytes(Number(slot.size))}
                </span>
                <span className="hidden text-sm text-foreground-muted md:block">
                  {slot.updatedAt ? compactTime(slot.updatedAt) : "unknown"}
                </span>
              </button>
              {expanded && (
                <div
                  id={detailsId}
                  role="region"
                  aria-label={`${name} details`}
                  className="border-t border-divider bg-elevation-0/40"
                >
                  <SlotDetails slot={slot} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlotDetails({ slot }: { slot: api.SystemSlotInfo }) {
  const hashes = Object.entries(slot.hashes ?? {}).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );

  return (
    <div className="space-y-4 px-4 py-4">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Hashes
        </h3>
        {hashes.length > 0 ? (
          <dl className="mt-2 space-y-3">
            {hashes.map(([algorithm, hash]) => (
              <div
                key={algorithm}
                className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-4"
              >
                <dt className="font-mono text-xs font-semibold text-foreground-muted">
                  {algorithm}
                </dt>
                <dd className="break-all font-mono text-xs text-foreground">
                  {hash}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-foreground-muted">
            No hashes reported for this slot.
          </p>
        )}
      </section>
    </div>
  );
}

function SlotStatus({ active }: { active?: boolean }) {
  if (active === true) {
    return (
      <Badge
        color="bg-success-surface text-success ring-success/30"
        className="justify-self-start"
      >
        active
      </Badge>
    );
  }
  if (active === false) {
    return (
      <Badge
        color="bg-elevation-2 text-foreground-muted ring-divider"
        className="justify-self-start"
      >
        inactive
      </Badge>
    );
  }
  return (
    <Badge
      color="bg-elevation-2 text-foreground-muted ring-divider"
      className="justify-self-start"
    >
      unknown
    </Badge>
  );
}
