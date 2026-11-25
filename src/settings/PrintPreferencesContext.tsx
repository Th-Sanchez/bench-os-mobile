import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type PrintLabelMode = 'DISABLED' | 'A4' | 'THERMAL_58MM';

export interface PrintPreferences {
  mode: PrintLabelMode;
  scannerEnabled: boolean;
}

const STORAGE_KEY = 'benchos_print_preferences_v1';

const DEFAULT_PREFERENCES: PrintPreferences = {
  mode: 'DISABLED',
  scannerEnabled: false,
};

async function readStoredPreferences(): Promise<PrintPreferences> {
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        raw = window.localStorage.getItem(STORAGE_KEY);
      }
    } else {
      raw = await SecureStore.getItemAsync(STORAGE_KEY);
    }

    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<PrintPreferences>;
    const mode: PrintLabelMode =
      parsed.mode === 'A4' || parsed.mode === 'THERMAL_58MM' || parsed.mode === 'DISABLED'
        ? parsed.mode
        : 'DISABLED';

    return {
      mode,
      scannerEnabled: Boolean(parsed.scannerEnabled),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

async function persistPreferences(prefs: PrintPreferences): Promise<void> {
  const serialized = JSON.stringify(prefs);
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, serialized);
      }
    } else {
      await SecureStore.setItemAsync(STORAGE_KEY, serialized);
    }
  } catch {
    // Preference persistence is best-effort
  }
}

interface PrintPreferencesContextValue {
  mode: PrintLabelMode;
  scannerEnabled: boolean;
  isPrintEnabled: boolean;
  isHydrated: boolean;
  setMode: (mode: PrintLabelMode) => void;
  setScannerEnabled: (enabled: boolean) => void;
}

const PrintPreferencesContext = createContext<PrintPreferencesContextValue | null>(null);

export function PrintPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<PrintPreferences>(DEFAULT_PREFERENCES);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void readStoredPreferences().then((loaded) => {
      if (!active) return;
      setPrefs(loaded);
      setIsHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((nextMode: PrintLabelMode) => {
    setPrefs((prev) => {
      // Automatically turn on QR scanner when enabling printing from DISABLED for convenience,
      // while still letting the user toggle the scanner independently at any time.
      const nextScanner =
        prev.mode === 'DISABLED' && nextMode !== 'DISABLED' ? true : prev.scannerEnabled;
      const updated: PrintPreferences = {
        mode: nextMode,
        scannerEnabled: nextScanner,
      };
      void persistPreferences(updated);
      return updated;
    });
  }, []);

  const setScannerEnabled = useCallback((enabled: boolean) => {
    setPrefs((prev) => {
      const updated: PrintPreferences = {
        ...prev,
        scannerEnabled: enabled,
      };
      void persistPreferences(updated);
      return updated;
    });
  }, []);

  const value = useMemo<PrintPreferencesContextValue>(
    () => ({
      mode: prefs.mode,
      scannerEnabled: prefs.scannerEnabled,
      isPrintEnabled: prefs.mode !== 'DISABLED',
      isHydrated,
      setMode,
      setScannerEnabled,
    }),
    [prefs.mode, prefs.scannerEnabled, isHydrated, setMode, setScannerEnabled]
  );

  return (
    <PrintPreferencesContext.Provider value={value}>
      {children}
    </PrintPreferencesContext.Provider>
  );
}

export function usePrintPreferences(): PrintPreferencesContextValue {
  const ctx = useContext(PrintPreferencesContext);
  if (!ctx) {
    throw new Error('usePrintPreferences must be used within a PrintPreferencesProvider');
  }
  return ctx;
}
