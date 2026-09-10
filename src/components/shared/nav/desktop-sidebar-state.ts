'use client';

import { useLayoutEffect, useSyncExternalStore } from 'react';

export const DESKTOP_SIDEBAR_ID = 'app-desktop-sidebar';
export const DESKTOP_SIDEBAR_OFFSET_VAR = '--at-app-sidebar-offset';
export const DESKTOP_SIDEBAR_OPEN_STORAGE_KEY =
  'atlaris:desktop-sidebar-open:v1';
export const DESKTOP_SIDEBAR_COLLAPSE_LABEL = 'Collapse sidebar';
export const DESKTOP_SIDEBAR_EXPAND_LABEL = 'Expand sidebar';
export const DESKTOP_SIDEBAR_COLLAPSE_CONTROL_ID =
  'app-desktop-sidebar-collapse';
export const DESKTOP_SIDEBAR_EXPAND_CONTROL_ID = 'app-desktop-sidebar-expand';

const OPEN_OFFSET = 'var(--at-semantic-layout-sidebar,14rem)';
const CLOSED_OFFSET = '0px';

const sidebarOpenListeners = new Set<() => void>();

export function applyDesktopSidebarOffset(open: boolean): void {
  document.documentElement.style.setProperty(
    DESKTOP_SIDEBAR_OFFSET_VAR,
    open ? OPEN_OFFSET : CLOSED_OFFSET,
  );
}

function readStoredOpen(): boolean {
  try {
    const stored = localStorage.getItem(DESKTOP_SIDEBAR_OPEN_STORAGE_KEY);
    if (stored === '0') return false;
    if (stored === '1') return true;
  } catch {
    // Private mode or disabled storage.
  }
  return true;
}

function writeStoredOpen(open: boolean): void {
  try {
    localStorage.setItem(DESKTOP_SIDEBAR_OPEN_STORAGE_KEY, open ? '1' : '0');
  } catch {
    // Private mode or disabled storage.
  }
}

function subscribeSidebarOpen(onStoreChange: () => void): () => void {
  sidebarOpenListeners.add(onStoreChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === DESKTOP_SIDEBAR_OPEN_STORAGE_KEY || event.key === null) {
      onStoreChange();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    sidebarOpenListeners.delete(onStoreChange);
    window.removeEventListener('storage', onStorage);
  };
}

function emitSidebarOpenChange(): void {
  for (const listener of sidebarOpenListeners) {
    listener();
  }
}

function getServerSidebarOpenSnapshot(): boolean {
  return true;
}

export function useDesktopSidebarOpen(enabled: boolean): {
  open: boolean;
  setOpen: (open: boolean) => void;
} {
  const storedOpen = useSyncExternalStore(
    subscribeSidebarOpen,
    readStoredOpen,
    getServerSidebarOpenSnapshot,
  );
  const open = enabled ? storedOpen : true;

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }

    applyDesktopSidebarOffset(open);
  }, [enabled, open]);

  const setOpen = (next: boolean) => {
    if (!enabled) {
      return;
    }

    writeStoredOpen(next);
    applyDesktopSidebarOffset(next);
    emitSidebarOpenChange();
  };

  return { open, setOpen };
}
