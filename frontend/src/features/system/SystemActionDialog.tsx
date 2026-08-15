import { useState } from "react";
import type { api } from "../../generated";
import { ModalDialog } from "../../shared/components/ModalDialog";
import {
  buttonClass,
  dangerButtonClass,
  fieldClass,
  primaryButtonClass,
} from "../../shared/styles";

export function SystemActionDialog({
  action,
  bootGroup,
  busy,
  onClose,
  onApprove,
}: {
  action: api.SystemAction;
  bootGroup?: string;
  busy: boolean;
  onClose: () => void;
  onApprove: (options?: api.SystemActionOptions) => void;
}) {
  const [backupState, setBackupState] = useState(false);
  const [backupName, setBackupName] = useState("");
  const content = actionContent(action, bootGroup);
  const factoryReset = action === "factory-reset";

  return (
    <ModalDialog title={content.title} className="max-w-md" onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onApprove(
            factoryReset
              ? {
                  backup: backupState || undefined,
                  backupName: backupState
                    ? backupName.trim() || undefined
                    : undefined,
                }
              : undefined,
          );
        }}
      >
        <p className="text-sm leading-6 text-foreground-muted">
          {content.description}
        </p>
        {factoryReset && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-foreground-muted">
              <input
                className="size-4 accent-primary"
                type="checkbox"
                checked={backupState}
                onChange={(event) => setBackupState(event.target.checked)}
              />
              Preserve current state as a profile
            </label>
            {backupState && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-foreground-muted">
                  Backup profile name (optional)
                </span>
                <input
                  className={fieldClass}
                  value={backupName}
                  onChange={(event) => setBackupName(event.target.value)}
                />
              </label>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-divider pt-4">
          <button type="button" className={buttonClass} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className={factoryReset ? dangerButtonClass : primaryButtonClass}
            disabled={busy}
          >
            {content.buttonLabel}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

function actionContent(action: api.SystemAction, bootGroup?: string) {
  switch (action) {
    case "commit":
      return {
        title: "Commit system",
        description: bootGroup
          ? `Commit boot group ${bootGroup} as the default system?`
          : "Commit the currently active boot group as the default system?",
        buttonLabel: "Commit",
      };
    case "reboot":
      return {
        title: "Reboot system",
        description: bootGroup
          ? `Reboot the device into boot group ${bootGroup} now? Running services will be interrupted.`
          : "Reboot the device now? Running services will be interrupted.",
        buttonLabel: "Reboot",
      };
    case "reboot-spare":
      return {
        title: "Reboot into spare system",
        description: bootGroup
          ? `Reboot the device into boot group ${bootGroup}? Running services will be interrupted.`
          : "Reboot the device into its spare boot group? Running services will be interrupted.",
        buttonLabel: "Reboot spare",
      };
    case "factory-reset":
      return {
        title: "Factory reset",
        description:
          "Reset persistent state and reboot the device. Unless preserved below, the current state and installed app data will be permanently removed.",
        buttonLabel: "Factory reset",
      };
  }
}
