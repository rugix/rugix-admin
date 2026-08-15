import { Menu } from "@base-ui/react/menu";
import type { ComponentProps, ReactNode } from "react";
import { classes } from "../lib/classes";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({
  align = "end",
  sideOffset = 4,
  className,
  ...props
}: ComponentProps<typeof Menu.Popup> & {
  align?: ComponentProps<typeof Menu.Positioner>["align"];
  sideOffset?: ComponentProps<typeof Menu.Positioner>["sideOffset"];
}) {
  return (
    <Menu.Portal>
      <Menu.Positioner
        align={align}
        sideOffset={sideOffset}
        className="z-40 outline-none"
      >
        <Menu.Popup
          className={classes(
            "min-w-48 rounded-lg border border-frame bg-elevation-1 p-1 text-foreground shadow-elevation-plus-3 outline-none",
            className,
          )}
          {...props}
        />
      </Menu.Positioner>
    </Menu.Portal>
  );
}

export function DropdownMenuItem({
  icon,
  onSelect,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Menu.Item>, "onClick"> & {
  icon?: ReactNode;
  onSelect?: () => void;
}) {
  return (
    <Menu.Item
      className={classes(
        "flex h-9 cursor-default select-none items-center gap-2 rounded-md px-2.5 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-elevation-3",
        className,
      )}
      onClick={onSelect}
      {...props}
    >
      <span
        className="inline-flex size-4 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        {icon}
      </span>
      {children}
    </Menu.Item>
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Menu.Separator>) {
  return (
    <Menu.Separator
      className={classes("my-1 border-t border-divider", className)}
      {...props}
    />
  );
}
