import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";

export function Tooltip({
  content,
  children,
}: {
  content: ReactNode;
  children: ReactNode;
}) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger
        delay={300}
        render={<span className="inline-flex" tabIndex={0} />}
      >
        {children}
      </BaseTooltip.Trigger>
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner sideOffset={8} className="z-[60]">
          <BaseTooltip.Popup
            role="tooltip"
            className="max-w-64 rounded-md border border-frame bg-elevation-3 px-2.5 py-1.5 text-xs leading-5 text-foreground shadow-elevation-plus-3"
          >
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
