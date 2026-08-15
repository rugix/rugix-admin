import { useState } from "react";
import type { api } from "../../generated";
import { ModalDialog } from "../../shared/components/ModalDialog";
import { generationLabel } from "../../shared/lib/format";
import {
  buttonClass,
  dangerButtonClass,
  primaryButtonClass,
} from "../../shared/styles";

export type AppApprovalAction = Extract<
  api.AppAction,
  "activate" | "deactivate" | "rollback" | "remove"
>;

export function AppActionDialog({
  app,
  action,
  generation,
  dangerouslyInsecure,
  busy,
  onClose,
  onApprove,
}: {
  app: string;
  action: AppApprovalAction;
  generation?: api.AppGeneration["number"];
  dangerouslyInsecure: boolean;
  busy: boolean;
  onClose: () => void;
  onApprove: (skipCompatibilityCheck: boolean) => void;
}) {
  const [skipCompatibilityCheck, setSkipCompatibilityCheck] = useState(false);
  const content = actionContent(app, action, generation);

  return (
    <ModalDialog title={content.title} className="max-w-md" onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onApprove(skipCompatibilityCheck);
        }}
      >
        <p className="text-sm leading-6 text-foreground-muted">
          {content.description}
        </p>
        {dangerouslyInsecure && (
          <label className="flex items-center gap-2 text-sm text-danger">
            <input
              className="size-4 accent-danger"
              type="checkbox"
              checked={skipCompatibilityCheck}
              onChange={(event) =>
                setSkipCompatibilityCheck(event.target.checked)
              }
            />
            Skip compatibility checks
          </label>
        )}
        <div className="flex justify-end gap-2 border-t border-divider pt-4">
          <button type="button" className={buttonClass} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className={
              action === "remove" ? dangerButtonClass : primaryButtonClass
            }
            disabled={busy}
          >
            {content.buttonLabel}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

function actionContent(
  app: string,
  action: AppApprovalAction,
  generation?: api.AppGeneration["number"],
) {
  const appName = <span className="font-mono text-foreground">{app}</span>;
  switch (action) {
    case "activate":
      return {
        title: "Activate generation",
        description: (
          <>
            Activate generation {generationLabel(generation)} for {appName}?
          </>
        ),
        buttonLabel: "Activate",
      };
    case "deactivate":
      return {
        title: "Deactivate app",
        description: <>Deactivate {appName} and its current generation?</>,
        buttonLabel: "Deactivate",
      };
    case "rollback":
      return {
        title: "Rollback app",
        description: (
          <>Roll back {appName} to its previously active generation?</>
        ),
        buttonLabel: "Rollback",
      };
    case "remove":
      return {
        title: "Remove app",
        description: (
          <>
            Remove {appName} and all of its generations? This action cannot be
            undone.
          </>
        ),
        buttonLabel: "Remove app",
      };
  }
}
