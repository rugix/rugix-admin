import { Boxes, ExternalLink, HardDriveUpload, Moon, Network, RefreshCw, Server, Sun } from "lucide-react";
import rugixLogo from "../../assets/rugix-logo.svg";
import type { jobs } from "../../generated";
import { iconButtonClass } from "../../shared/styles";
import type { Tab, Theme } from "../../types";
import { TabButton } from "./TabButton";

export function TopNav({
  tab,
  theme,
  pendingJobs,
  onTabChange,
  onThemeChange,
  onRefresh,
  refreshing,
}: {
  tab: Tab;
  theme: Theme;
  pendingJobs: jobs.Job[];
  onTabChange: (tab: Tab) => void;
  onThemeChange: (theme: Theme) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-divider bg-elevation-0/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1520px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <img src={rugixLogo} alt="" className="size-9 shrink-0" />
          <div className="truncate font-display text-base font-semibold">Rugix Admin</div>
        </div>

        <nav
          aria-label="Admin sections"
          className="order-3 flex w-full rounded-lg border border-divider bg-elevation-1 p-1 sm:order-none sm:ml-4 sm:w-auto"
        >
          <TabButton active={tab === "system"} icon={<Server size={16} />} label="System" onClick={() => onTabChange("system")} />
          <TabButton
            active={tab === "components"}
            icon={<Network size={16} />}
            label="Components"
            onClick={() => onTabChange("components")}
          />
          <TabButton active={tab === "apps"} icon={<Boxes size={16} />} label="Apps" onClick={() => onTabChange("apps")} />
          <TabButton
            active={tab === "jobs"}
            icon={<HardDriveUpload size={16} />}
            label={pendingJobs.length > 0 ? `Jobs ${pendingJobs.length}` : "Jobs"}
            onClick={() => onTabChange("jobs")}
          />
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <a
            className="hidden h-9 items-center justify-center gap-2 rounded-md border border-divider bg-elevation-1 px-3 text-sm font-medium text-foreground-muted transition hover:bg-elevation-3 hover:text-foreground sm:inline-flex"
            href="https://rugix.org"
            target="_blank"
            rel="noreferrer"
          >
            Rugix
            <ExternalLink size={15} />
          </a>
          <button
            className={iconButtonClass}
            onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "Use light mode" : "Use dark mode"}
            aria-label={theme === "dark" ? "Use light mode" : "Use dark mode"}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button
            className={iconButtonClass}
            onClick={onRefresh}
            title="Refresh"
            aria-label="Refresh device information"
            disabled={refreshing}
          >
            <RefreshCw size={17} className={refreshing ? "animate-spin" : undefined} />
          </button>
        </div>
      </div>
    </header>
  );
}
