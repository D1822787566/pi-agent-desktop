import type { IpcRendererEvent } from "electron";
import { contextBridge, ipcRenderer } from "electron";

type BrowserWorkbenchState = {
  url: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  error?: string;
};

type BrowserWorkbenchEvent = {
  id: string;
  state: BrowserWorkbenchState;
};

contextBridge.exposeInMainWorld("electronAPI", {
  selectDirectory: () => ipcRenderer.invoke("select-directory"),
  onUpdateAvailable: (callback: (info: { version: string }) => void) => {
    const listener = (_event: IpcRendererEvent, info: { version: string }) => callback(info);
    ipcRenderer.on("update-available", listener);
    return () => ipcRenderer.off("update-available", listener);
  },
  onUpdateDownloaded: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("update-downloaded", listener);
    return () => ipcRenderer.off("update-downloaded", listener);
  },
  quitAndInstall: () => ipcRenderer.invoke("quit-and-install"),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  showBrowserWorkbench: (id: string, bounds: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke("browser-workbench-show", id, bounds),
  hideBrowserWorkbench: (id: string) => ipcRenderer.invoke("browser-workbench-hide", id),
  closeBrowserWorkbench: (id: string) => ipcRenderer.invoke("browser-workbench-close", id),
  navigateBrowserWorkbench: (id: string, url: string) => ipcRenderer.invoke("browser-workbench-navigate", id, url),
  browserWorkbenchBack: (id: string) => ipcRenderer.invoke("browser-workbench-back", id),
  browserWorkbenchForward: (id: string) => ipcRenderer.invoke("browser-workbench-forward", id),
  onBrowserWorkbenchState: (callback: (event: BrowserWorkbenchEvent) => void) => {
    const listener = (_event: IpcRendererEvent, event: BrowserWorkbenchEvent) => callback(event);
    ipcRenderer.on("browser-workbench-state", listener);
    return () => ipcRenderer.off("browser-workbench-state", listener);
  },
  setTheme: (isDark: boolean) => ipcRenderer.send("set-theme", isDark),
});
