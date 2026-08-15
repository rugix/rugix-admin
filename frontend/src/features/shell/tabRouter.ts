import { useCallback, useEffect, useState } from "react";
import type { Tab } from "./types";

const DEFAULT_TAB: Tab = "system";
const TABS = new Set<Tab>(["system", "components", "apps", "jobs"]);

export function tabHref(tab: Tab) {
  return `#/${tab}`;
}

export function useTabRouter() {
  const [tab, setTab] = useState<Tab>(() => tabFromHash() ?? DEFAULT_TAB);

  useEffect(() => {
    const syncTab = () => {
      const nextTab = tabFromHash();
      if (nextTab) {
        setTab(nextTab);
      } else {
        window.history.replaceState(null, "", tabHref(DEFAULT_TAB));
        setTab(DEFAULT_TAB);
      }
    };
    syncTab();
    window.addEventListener("hashchange", syncTab);
    return () => window.removeEventListener("hashchange", syncTab);
  }, []);

  const navigate = useCallback((nextTab: Tab) => {
    const href = tabHref(nextTab);
    if (window.location.hash === href) {
      setTab(nextTab);
    } else {
      window.location.hash = href.slice(1);
    }
  }, []);

  return { tab, navigate };
}

function tabFromHash(): Tab | undefined {
  const candidate = window.location.hash.match(/^#\/([^/]+)\/?$/)?.[1];
  return candidate && TABS.has(candidate as Tab) ? (candidate as Tab) : undefined;
}
