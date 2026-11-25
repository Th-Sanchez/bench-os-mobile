import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Locale, TranslationDictionary, translations } from './translations';

const LOCALE_STORAGE_KEY = 'benchos_locale_v1';

async function readStoredLocale(): Promise<Locale | null> {
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      }
    } else {
      raw = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
    }
    return raw === 'en' || raw === 'pt-BR' ? raw : null;
  } catch {
    return null;
  }
}

async function persistLocale(next: Locale): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
      }
    } else {
      await AsyncStorage.setItem(LOCALE_STORAGE_KEY, next);
    }
  } catch {
    // Best-effort preference persistence
  }
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslationDictionary;
  formatCurrency: (amount: number | null | undefined) => string;
  formatPhone: (digits: string | null | undefined) => string;
  formatShortDate: (isoDate: string | null | undefined) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('pt-BR');

  useEffect(() => {
    let active = true;
    void readStoredLocale().then((stored) => {
      if (active && stored) {
        setLocaleState(stored);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    void persistLocale(next);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const t = translations[locale];

    const formatCurrency = (amount: number | null | undefined) => {
      const safe = typeof amount === 'number' && !Number.isNaN(amount) ? amount : 0;
      const formatted = safe.toLocaleString(locale === 'pt-BR' ? 'pt-BR' : 'en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return `R$ ${formatted}`;
    };

    const formatPhone = (raw: string | null | undefined) => {
      if (!raw) return '';
      const digits = raw.replace(/\D/g, '');
      if (digits.length === 11) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
      }
      if (digits.length === 10) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
      }
      return raw;
    };

    const formatShortDate = (iso: string | null | undefined) => {
      if (!iso) return '';
      const parts = iso.slice(0, 10).split('-');
      if (parts.length !== 3) return iso;
      return `${parts[2]}/${parts[1]}`;
    };

    return {
      locale,
      setLocale,
      t,
      formatCurrency,
      formatPhone,
      formatShortDate,
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
}
