import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { classes } from "../lib/classes";
import { iconButtonClass } from "../styles";

export function ModalDialog({
  title,
  onClose,
  children,
  className,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root
      defaultOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
          <Dialog.Popup
            className={classes(
              "flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-divider bg-elevation-1 text-foreground shadow-elevation-plus-3 outline-none",
              className,
            )}
          >
            <div className="flex min-h-14 items-center justify-between gap-3 border-b border-divider px-4 py-3 sm:px-5">
              <Dialog.Title className="text-base font-semibold text-foreground">
                {title}
              </Dialog.Title>
              <Dialog.Close className={iconButtonClass} aria-label="Close">
                <X size={18} />
              </Dialog.Close>
            </div>
            <div className="overflow-y-auto p-4 sm:p-5">{children}</div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
