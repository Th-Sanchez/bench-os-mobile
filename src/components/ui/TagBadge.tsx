import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '@/theme/tokens';

interface TagBadgeProps {
  label: string;
  variant?: 'dark' | 'subtle' | 'brand';
}

export function TagBadge({ label, variant = 'dark' }: TagBadgeProps) {
  return (
    <View style={[styles.base, variantContainer[variant]]}>
      <Text style={[styles.text, variantText[variant]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    letterSpacing: 0.2,
  },
});

const variantContainer = StyleSheet.create({
  dark: {
    backgroundColor: colors.darkPillBg,
  },
  subtle: {
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  brand: {
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
  },
});

const variantText = StyleSheet.create({
  dark: { color: colors.textOnDark },
  subtle: { color: colors.textSecondary, fontFamily: fonts.monoMedium },
  brand: { color: colors.brandPrimary },
});
