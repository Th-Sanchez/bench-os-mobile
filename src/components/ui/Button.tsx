import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, fonts, radius, touchTarget } from '@/theme/tokens';

type ButtonVariant = 'primary' | 'secondary' | 'whatsapp' | 'dangerOutline' | 'dashed';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  icon,
  fullWidth = true,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = Boolean(disabled || loading);

  return (
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        variantStyles[variant],
        pressed && !isDisabled && pressedStyles[variant],
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? colors.textOnDark : colors.brandPrimary}
        />
      ) : (
        <>
          {icon}
          <Text style={[styles.label, labelVariantStyles[variant]]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.minHeight,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.55,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.brandPrimary,
    minHeight: touchTarget.ctaHeight,
  },
  secondary: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  whatsapp: {
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  dangerOutline: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  dashed: {
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.brandPrimary,
  },
});

const pressedStyles = StyleSheet.create({
  primary: { backgroundColor: colors.brandPrimaryPressed },
  secondary: { backgroundColor: colors.bgSubtle },
  whatsapp: { opacity: 0.85 },
  dangerOutline: { opacity: 0.85 },
  dashed: { opacity: 0.85 },
});

const labelVariantStyles = StyleSheet.create({
  primary: { color: colors.textOnDark },
  secondary: { color: colors.textPrimary },
  whatsapp: { color: colors.successDark },
  dangerOutline: { color: colors.danger },
  dashed: { color: colors.brandPrimary },
});
