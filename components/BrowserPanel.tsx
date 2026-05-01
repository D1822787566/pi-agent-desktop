"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type BrowserWorkbenchState = {
  url: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  error?: string;
};

type BrowserWorkbenchResult = {
  ok: boolean;
  error?: string;
  state?: BrowserWorkbenchState;
};

type BrowserWorkbenchEvent = {
  id: string;
  state: BrowserWorkbenchState;
};

type ElectronAPI = {
  openExternal?: (url: string) => Promise<{ ok: boolean; error?: string }>;
  showBrowserWorkbench?: (id: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<BrowserWorkbenchResult>;
  hideBrowserWorkbench?: (id: string) => Promise<{ ok: boolean }>;
  closeBrowserWorkbench?: (id: string) => Promise<{ ok: boolean }>;
  navigateBrowserWorkbench?: (id: string, url: string) => Promise<BrowserWorkbenchResult>;
  browserWorkbenchBack?: (id: string) => Promise<BrowserWorkbenchResult>;
  browserWorkbenchForward?: (id: string) => Promise<BrowserWorkbenchResult>;
  onBrowserWorkbenchState?: (callback: (event: BrowserWorkbenchEvent) => void) => () => void;
};

function getElectronApi(): ElectronAPI | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { electronAPI?: ElectronAPI }).electronAPI;
}

function normaliseUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

async function openInSystemBrowser(url: string) {
  const electronApi = getElectronApi();
  if (electronApi?.openExternal) {
    await electronApi.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

const EMPTY_BROWSER_STATE: BrowserWorkbenchState = {
  url: null,
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
};

interface BrowserPanelProps {
  browserId: string;
  active: boolean;
}

export function BrowserPanel({ browserId, active }: BrowserPanelProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [address, setAddress] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [nativeBrowser, setNativeBrowser] = useState(false);
  const [browserState, setBrowserState] = useState<BrowserWorkbenchState>(EMPTY_BROWSER_STATE);
  const [error, setError] = useState<string | null>(null);
  const iframeUrl = historyIndex >= 0 ? history[historyIndex] : null;
  const currentUrl = nativeBrowser ? browserState.url : iframeUrl;
  const currentHost = useMemo(() => {
    if (!currentUrl) return null;
    try { return new URL(currentUrl).host; } catch { return null; }
  }, [currentUrl]);

  useEffect(() => {
    const electronApi = getElectronApi();
    if (!electronApi?.showBrowserWorkbench || !electronApi.hideBrowserWorkbench) return;

    let disposed = false;
    let animationFrame: number | null = null;
    setNativeBrowser(true);

    const applyState = (next: BrowserWorkbenchState | undefined) => {
      if (!next || disposed) return;
      setBrowserState(next);
      if (next.url) setAddress(next.url);
      setError(next.error ?? null);
    };
    if (!active) {
      void electronApi.hideBrowserWorkbench(browserId);
      return;
    }
    const updateBounds = () => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect || rect.width < 1 || rect.height < 1) return;
      void electronApi.showBrowserWorkbench!(browserId, {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }).then((result) => {
        if (!result.ok) setError(result.error || "Unable to display the native browser.");
        else applyState(result.state);
      }).catch((cause) => {
        if (!disposed) setError(cause instanceof Error ? cause.message : String(cause));
      });
    };
    const scheduleBoundsUpdate = () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(updateBounds);
    };

    const resizeObserver = new ResizeObserver(scheduleBoundsUpdate);
    if (viewportRef.current) resizeObserver.observe(viewportRef.current);
    window.addEventListener("resize", scheduleBoundsUpdate);
    const unsubscribe = electronApi.onBrowserWorkbenchState?.((event) => {
      if (event.id === browserId) applyState(event.state);
    });
    scheduleBoundsUpdate();

    return () => {
      disposed = true;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleBoundsUpdate);
      unsubscribe?.();
      void electronApi.hideBrowserWorkbench?.(browserId);
    };
  }, [active, browserId]);

  useEffect(() => {
    const electronApi = getElectronApi();
    return () => {
      void electronApi?.closeBrowserWorkbench?.(browserId);
    };
  }, [browserId]);

  const navigate = (raw: string) => {
    const url = normaliseUrl(raw);
    if (!url) {
      setError("Enter a valid http:// or https:// URL.");
      return;
    }
    setError(null);
    setAddress(url);

    const electronApi = getElectronApi();
    if (nativeBrowser && electronApi?.navigateBrowserWorkbench) {
      void electronApi.navigateBrowserWorkbench(browserId, url).then((result) => {
        if (result.ok && result.state) {
          setBrowserState(result.state);
          if (result.state.url) setAddress(result.state.url);
        } else {
          setError(result.error || "Unable to open this page.");
        }
      }).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
      return;
    }

    setHistory((previous) => {
      const next = [...previous.slice(0, historyIndex + 1), url];
      setHistoryIndex(next.length - 1);
      return next;
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(address);
  };

  const go = (direction: "back" | "forward") => {
    const electronApi = getElectronApi();
    if (nativeBrowser && electronApi) {
      const action = direction === "back" ? electronApi.browserWorkbenchBack : electronApi.browserWorkbenchForward;
      if (!action) return;
      void action(browserId).then((result) => {
        if (result.state) {
          setBrowserState(result.state);
          if (result.state.url) setAddress(result.state.url);
        }
      });
      return;
    }

    const nextIndex = direction === "back" ? historyIndex - 1 : historyIndex + 1;
    const url = history[nextIndex];
    if (!url) return;
    setHistoryIndex(nextIndex);
    setAddress(url);
    setError(null);
  };

  const canGoBack = nativeBrowser ? browserState.canGoBack : historyIndex > 0;
  const canGoForward = nativeBrowser ? browserState.canGoForward : historyIndex >= 0 && historyIndex < history.length - 1;

  return (
    <div className={active ? "flex h-full min-h-0 flex-col bg-bg" : "hidden"}>
      <form onSubmit={submit} className="flex items-center gap-1 border-b border-divider px-2 py-1.5">
        <button type="button" onClick={() => go("back")} disabled={!canGoBack} aria-label="Back" title="Back" className="h-7 w-7 rounded-control border-none bg-transparent text-text-muted hover:bg-bg-hover hover:text-text disabled:cursor-default disabled:opacity-35">←</button>
        <button type="button" onClick={() => go("forward")} disabled={!canGoForward} aria-label="Forward" title="Forward" className="h-7 w-7 rounded-control border-none bg-transparent text-text-muted hover:bg-bg-hover hover:text-text disabled:cursor-default disabled:opacity-35">→</button>
        <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Enter a web address" aria-label="Web address" className="h-7 min-w-0 flex-1 rounded-control border border-border bg-bg-panel px-2 text-[12px] text-text outline-none placeholder:text-text-dim focus:border-accent" />
        <button type="submit" className="h-7 rounded-control border border-border bg-bg-hover px-2 text-[11px] text-text hover:border-accent">Go</button>
        {currentUrl && <button type="button" onClick={() => void openInSystemBrowser(currentUrl)} aria-label="Open in system browser" title="Open in system browser" className="h-7 w-7 rounded-control border-none bg-transparent text-text-muted hover:bg-bg-hover hover:text-text">↗</button>}
      </form>
      {error && <div role="alert" className="border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-[11px] text-danger">{error}</div>}
      <div ref={viewportRef} className="relative min-h-0 flex-1 bg-white">
        {!nativeBrowser && currentUrl ? (
          <iframe src={currentUrl} title={currentHost ? `Browser: ${currentHost}` : "Embedded browser"} sandbox="allow-downloads allow-forms allow-popups allow-scripts" referrerPolicy="no-referrer" className="h-full w-full border-0 bg-white" />
        ) : !nativeBrowser ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-text-muted">
            <span className="text-[26px]">◉</span>
            <p className="m-0 text-[13px] font-medium text-text">Embedded browser</p>
            <p className="m-0 max-w-64 text-[11px] leading-5">Open a local site or a page that allows embedding. The desktop app uses a native browser view for regular websites.</p>
          </div>
        ) : null}
        {nativeBrowser && browserState.isLoading && <div className="pointer-events-none absolute right-2 top-2 rounded-control bg-black/60 px-2 py-1 text-[10px] text-white/85">Loading…</div>}
      </div>
    </div>
  );
}
