import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wifi, WifiOff } from 'lucide-react-native';
import { useI18n } from '@/i18n/I18nProvider';
import { useNetworkStatus } from '@/offline/NetworkStatusContext';
import { colors, fonts, spacing } from '@/theme/tokens';

function formatTime(ms: number | null): string | null {
  if (!ms) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const { locale } = useI18n();
  const { isOffline, justReconnected, lastSyncedAt } = useNetworkStatus();

  if (!isOffline && !justReconnected) {
    return null;
  }

  const syncedLabel = formatTime(lastSyncedAt);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.container,
        { paddingTop: Math.max(insets.top, 6) },
        isOffline ? styles.containerOffline : styles.containerOnline,
      ]}
    >
      <View style={styles.contentRow}>
        {isOffline ? (
          <WifiOff size={13} color={colors.warningDark} strokeWidth={2.4} />
        ) : (
          <Wifi size={13} color={colors.successDark} strokeWidth={2.4} />
        )}
        <Text
          style={[styles.text, isOffline ? styles.textOffline : styles.textOnline]}
          numberOfLines={1}
        >
          {isOffline
            ? locale === 'pt-BR'
              ? syncedLabel
                ? `Sem internet · Modo leitura (última sincronização ${syncedLabel})`
                : 'Sem internet · Modo leitura'
              : syncedLabel
                ? `Offline · Read-only mode (last synced at ${syncedLabel})`
                : 'Offline · Read-only mode'
            : locale === 'pt-BR'
              ? 'Conexão restabelecida · Sincronizando...'
              : 'Back online · Syncing...'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 7,
    borderBottomWidth: 1,
  },
  containerOffline: {
    backgroundColor: colors.warningSoft,
    borderBottomColor: colors.warningBorder,
  },
  containerOnline: {
    backgroundColor: colors.successSoft,
    borderBottomColor: colors.successBorder,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  text: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
  },
  textOffline: {
    color: colors.warningDark,
  },
  textOnline: {
    color: colors.successDark,
  },
});
