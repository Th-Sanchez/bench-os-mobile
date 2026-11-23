import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { colors, fonts, radius, touchTarget } from '@/theme/tokens';

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  mono?: boolean;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export function TextField({
  label,
  error,
  mono = false,
  leftIcon,
  rightElement,
  style,
  ...rest
}: TextFieldProps) {
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.inputWrapper, error ? styles.inputError : null]}>
        {leftIcon ? <View style={styles.leftIcon}>{leftIcon}</View> : null}
        <TextInput
          placeholderTextColor={colors.textMuted}
          style={[styles.input, mono && styles.monoInput, style]}
          {...rest}
        />
        {rightElement ? <View style={styles.rightElement}>{rightElement}</View> : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  inputWrapper: {
    minHeight: touchTarget.minHeight,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  inputError: {
    borderColor: colors.danger,
  },
  leftIcon: {
    marginRight: 8,
  },
  rightElement: {
    marginLeft: 8,
  },
  input: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: 10,
  },
  monoInput: {
    fontFamily: fonts.monoMedium,
  },
  errorText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.danger,
  },
});
