import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, RotateCcw } from 'lucide-react-native';
import type { ExpoRouterErrorBoundaryProps } from '@sentry/react-native';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

export function AppErrorFallback({ error, retry }: ExpoRouterErrorBoundaryProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <AlertTriangle size={28} color={colors.danger} strokeWidth={2.2} />
        </View>

        <Text style={styles.overline}>BENCHOS · RECUPERAÇÃO</Text>
        <Text style={styles.title}>Algo deu errado nesta tela</Text>
        <Text style={styles.description}>
          O erro foi registrado automaticamente para análise. Tente recarregar a tela para
          continuar trabalhando na bancada.
        </Text>

        {__DEV__ && error?.message ? (
          <View style={styles.devBox}>
            <Text style={styles.devText} numberOfLines={6}>
              {error.message}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => {
            void retry();
          }}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <RotateCcw size={16} color={colors.textOnDark} strokeWidth={2.2} />
          <Text style={styles.buttonText}>Recarregar tela</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgCanvas,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: radius.lg,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  overline: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: 20,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  description: {
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: spacing.lg,
  },
  devBox: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  devText: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.danger,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: radius.md,
    minWidth: 200,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textOnDark,
  },
});
