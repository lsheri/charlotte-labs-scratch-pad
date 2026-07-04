import { useEffect, useState } from "react";

const KEY = "charlotte:activeWorkspaceId";
const EVT = "charlotte:active-workspace-changed";

export function getActiveWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(KEY); } catch { return null; }
}

export function setActiveWorkspaceId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(KEY, id);
    else window.localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVT));
  } catch {}
}

export function useActiveWorkspaceId(): [string | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(() => getActiveWorkspaceId());
  useEffect(() => {
    const on = () => setId(getActiveWorkspaceId());
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return [id, setActiveWorkspaceId];
}
