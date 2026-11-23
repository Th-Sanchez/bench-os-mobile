import React, { createContext, useContext, useMemo, useState } from 'react';
import { Locale, TranslationDictionary, translations } from './translations';

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
  const [locale, setLocale] = useState<Locale>('pt-BR');

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
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
}
