import { useState } from "react";
import type { api } from "../../generated";
import { ModalDialog } from "../../shared/components/ModalDialog";
import { parseIdx } from "../../shared/lib/numbers";
import {
  buttonClass,
  dangerButtonClass,
  fieldClass,
} from "../../shared/styles";

export function GarbageCollectDialog({
  title,
  description,
  inputLabel,
  busy,
  onClose,
  onGarbageCollect,
}: {
  title: string;
  description: string;
  inputLabel: string;
  busy: boolean;
  onClose: () => void;
  onGarbageCollect: (
    keep: NonNullable<api.AppGarbageCollectionOptions["keep"]>,
  ) => void;
}) {
  const [keepGenerations, setKeepGenerations] = useState("1");
  const keep = parseIdx(keepGenerations);

  return (
    <ModalDialog title={title} className="max-w-lg" onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (keep !== undefined) onGarbageCollect(keep);
        }}
      >
        <p className="text-sm leading-6 text-foreground-muted">{description}</p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground-muted">
            {inputLabel}
          </span>
          <input
            aria-label={inputLabel}
            className={fieldClass}
            type="number"
            min="0"
            step="1"
            value={keepGenerations}
            onChange={(event) => setKeepGenerations(event.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2 border-t border-divider pt-4">
          <button type="button" className={buttonClass} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className={dangerButtonClass}
            disabled={keep === undefined || busy}
          >
            Garbage collect
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
