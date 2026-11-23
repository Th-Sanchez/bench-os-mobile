import type { ItemStatus } from '@/types/api';

export const colors = {
  bgCanvas: '#F8FAFC',
  bgSurface: '#FFFFFF',
  bgSubtle: '#F1F5F9',
  bgInput: '#F8FAFC',

  borderSubtle: '#E2E8F0',
  borderStrong: '#CBD5E1',

  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  textOnDark: '#FFFFFF',

  brandPrimary: '#2563EB',
  brandPrimaryPressed: '#1D4ED8',
  brandPrimarySoft: '#EFF6FF',
  brandPrimaryBorder: '#BFDBFE',

  darkPillBg: '#0F172A',

  success: '#10B981',
  successDark: '#065F46',
  successSoft: '#ECFDF5',
  successBorder: '#A7F3D0',

  warning: '#D97706',
  warningDark: '#92400E',
  warningSoft: '#FFFBEB',
  warningBorder: '#FDE68A',

  danger: '#DC2626',
  dangerDark: '#991B1B',
  dangerSoft: '#FEF2F2',
  dangerBorder: '#FECACA',

  info: '#2563EB',
  infoDark: '#1E40AF',
  infoSoft: '#EFF6FF',
  infoBorder: '#BFDBFE',

  neutral: '#475569',
  neutralDark: '#334155',
  neutralSoft: '#F1F5F9',
  neutralBorder: '#E2E8F0',
} as const;

export const fonts = {
  headlineSemiBold: 'PlusJakartaSans_600SemiBold',
  headlineBold: 'PlusJakartaSans_700Bold',
  bodyRegular: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
  monoMedium: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 9999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const touchTarget = {
  minHeight: 48,
  ctaHeight: 52,
} as const;

export interface StatusStyle {
  bg: string;
  text: string;
  dot: string;
  border: string;
}

export const itemStatusStyles: Record<ItemStatus, StatusStyle> = {
  RECEIVED: {
    bg: colors.neutralSoft,
    text: colors.neutralDark,
    dot: colors.neutral,
    border: colors.neutralBorder,
  },
  DIAGNOSING: {
    bg: colors.infoSoft,
    text: colors.infoDark,
    dot: colors.info,
    border: colors.infoBorder,
  },
  QUOTE_SENT: {
    bg: colors.warningSoft,
    text: colors.warningDark,
    dot: colors.warning,
    border: colors.warningBorder,
  },
  APPROVED: {
    bg: colors.infoSoft,
    text: colors.infoDark,
    dot: colors.info,
    border: colors.infoBorder,
  },
  WAITING_PARTS: {
    bg: colors.warningSoft,
    text: colors.warningDark,
    dot: colors.warning,
    border: colors.warningBorder,
  },
  IN_REPAIR: {
    bg: colors.infoSoft,
    text: colors.infoDark,
    dot: colors.info,
    border: colors.infoBorder,
  },
  READY_FOR_PICKUP: {
    bg: colors.successSoft,
    text: colors.successDark,
    dot: colors.success,
    border: colors.successBorder,
  },
  DELIVERED: {
    bg: colors.neutralSoft,
    text: colors.neutralDark,
    dot: colors.success,
    border: colors.neutralBorder,
  },
  REJECTED: {
    bg: colors.dangerSoft,
    text: colors.dangerDark,
    dot: colors.danger,
    border: colors.dangerBorder,
  },
  DISCARDED: {
    bg: colors.neutralSoft,
    text: colors.textMuted,
    dot: colors.textMuted,
    border: colors.neutralBorder,
  },
  CANCELLED: {
    bg: colors.dangerSoft,
    text: colors.dangerDark,
    dot: colors.danger,
    border: colors.dangerBorder,
  },
};
