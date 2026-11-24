import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Clock,
  MessageCircle,
  Trash2,
  User,
} from 'lucide-react-native';
import { ordersApi, tenantSettingsApi } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TagBadge } from '@/components/ui/TagBadge';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { OrderItemQueueResponse } from '@/types/api';
import { getWaitingDays } from '@/utils/staleItems';

type StaleFilter = 'ALL' | 'OVER_30' | 'OVER_90' | 'ELIGIBLE';

function buildWhatsappPhone(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '');
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return `55${digits}`;
  }
  return digits;
}

export default function StaleAppliancesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { t, locale, formatCurrency, formatPhone } = useI18n();

  const [filter, setFilter] = useState<StaleFilter>('ALL');

  const staleQuery = useQuery({
    queryKey: ['stale-items'],
    queryFn: () =>
      ordersApi.listBenchQueue({
        status: ['READY_FOR_PICKUP', 'REJECTED'],
        page: 0,
        size: 100,
      }),
  });

  const eligibleQuery = useQuery({
    queryKey: ['abandonment-eligible'],
    queryFn: () => ordersApi.listAbandonmentEligible({ page: 0, size: 100 }),
  });

  const settingsQuery = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.get(),
  });

  const abandonmentDays = settingsQuery.data?.abandonmentDays ?? 180;

  const eligibleIdSet = useMemo(() => {
    return new Set((eligibleQuery.data?.content ?? []).map((item) => item.id));
  }, [eligibleQuery.data]);

  const enrichedItems = useMemo(() => {
    const rawItems = staleQuery.data?.content ?? [];
    const seen = new Set<string>();
    const combined: OrderItemQueueResponse[] = [];

    for (const item of [...(eligibleQuery.data?.content ?? []), ...rawItems]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        combined.push(item);
      }
    }

    return combined
      .map((item) => {
        const waitingDays = getWaitingDays(item);
        const isEligible = eligibleIdSet.has(item.id) || waitingDays >= abandonmentDays;
        const daysUntilDiscard = Math.max(0, abandonmentDays - waitingDays);
        return {
          item,
          waitingDays,
          isEligible,
          daysUntilDiscard,
        };
      })
      .sort((a, b) => b.waitingDays - a.waitingDays);
  }, [staleQuery.data, eligibleQuery.data, eligibleIdSet, abandonmentDays]);

  const counts = useMemo(() => {
    let over30 = 0;
    let over90 = 0;
    let eligible = 0;
    for (const entry of enrichedItems) {
      if (entry.waitingDays >= 30) over30 += 1;
      if (entry.waitingDays >= 90) over90 += 1;
      if (entry.isEligible) eligible += 1;
    }
    return {
      ALL: enrichedItems.length,
      OVER_30: over30,
      OVER_90: over90,
      ELIGIBLE: eligible,
    };
  }, [enrichedItems]);

  const visibleItems = useMemo(() => {
    return enrichedItems.filter((entry) => {
      if (filter === 'OVER_30') return entry.waitingDays >= 30;
      if (filter === 'OVER_90') return entry.waitingDays >= 90;
      if (filter === 'ELIGIBLE') return entry.isEligible;
      return true;
    });
  }, [enrichedItems, filter]);

  const discardMutation = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: string; itemId: string }) =>
      ordersApi.transitionStatus(orderId, itemId, { status: 'DISCARDED' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stale-items'] });
      void queryClient.invalidateQueries({ queryKey: ['abandonment-eligible'] });
      void queryClient.invalidateQueries({ queryKey: ['abandonment-eligible-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['bench-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['orders-list'] });
    },
    onError: (err) => {
      Alert.alert(
        locale === 'pt-BR' ? 'Não foi possível descartar' : 'Could not mark as discarded',
        err instanceof ApiError ? err.message : t.common.errorGeneric
      );
    },
  });

  const handleConfirmDiscard = (entry: (typeof enrichedItems)[number]) => {
    const appliance = [entry.item.applianceType, entry.item.brand, entry.item.model]
      .filter(Boolean)
      .join(' ');

    Alert.alert(
      locale === 'pt-BR' ? 'Confirmar descarte auditável' : 'Confirm auditable discard',
      locale === 'pt-BR'
        ? `Marcar #${entry.item.tag} (${appliance}) como DESCARTADO por abandono (${entry.waitingDays} dias aguardando retirada)? Esta ação fica registrada no histórico da OS.`
        : `Mark #${entry.item.tag} (${appliance}) as DISCARDED for abandonment (${entry.waitingDays} days waiting)? This action is permanently recorded.`,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: locale === 'pt-BR' ? 'Confirmar descarte' : 'Confirm discard',
          style: 'destructive',
          onPress: () =>
            discardMutation.mutate({
              orderId: entry.item.serviceOrderId,
              itemId: entry.item.id,
            }),
        },
      ]
    );
  };

  const handleSendWhatsappReminder = (entry: (typeof enrichedItems)[number]) => {
    const phone = entry.item.customerPhone;
    if (!phone) {
      Alert.alert(
        locale === 'pt-BR' ? 'Telefone ausente' : 'No phone number',
        locale === 'pt-BR'
          ? 'Este cliente não possui telefone cadastrado.'
          : 'This customer has no phone number on file.'
      );
      return;
    }

    const shopName = session?.tenant.name ?? 'nossa oficina';
    const customerName = entry.item.customerName ?? (locale === 'pt-BR' ? 'cliente' : 'customer');
    const appliance = [entry.item.applianceType, entry.item.brand, entry.item.model]
      .filter(Boolean)
      .join(' ');

    let message: string;
    if (locale === 'pt-BR') {
      const statusText =
        entry.item.status === 'READY_FOR_PICKUP'
          ? `está pronto para retirada há ${entry.waitingDays} ${entry.waitingDays === 1 ? 'dia' : 'dias'}`
          : `com orçamento recusado aguarda retirada há ${entry.waitingDays} ${entry.waitingDays === 1 ? 'dia' : 'dias'}`;
      const priceNote =
        entry.item.status === 'READY_FOR_PICKUP' && Number(entry.item.totalPrice) > 0
          ? `\nValor do reparo: ${formatCurrency(entry.item.totalPrice)}`
          : '';
      const policyNote = entry.isEligible
        ? `\n\nAtenção: o prazo de guarda de ${abandonmentDays} dias já foi atingido. Caso não haja retorno, o aparelho poderá ser encaminhado para descarte.`
        : entry.waitingDays >= 30
          ? `\n\nLembramos que nosso prazo máximo de guarda é de ${abandonmentDays} dias (restam ${entry.daysUntilDiscard} dias).`
          : '';
      message = `Olá ${customerName}! Aqui é da ${shopName}. Seu aparelho ${appliance} (OS #${entry.item.tag}) ${statusText}.${priceNote}${policyNote}\n\nQuando podemos agendar a retirada?`;
    } else {
      const statusText =
        entry.item.status === 'READY_FOR_PICKUP'
          ? `has been ready for pickup for ${entry.waitingDays} day(s)`
          : `with a rejected quote has been waiting for pickup for ${entry.waitingDays} day(s)`;
      const policyNote = entry.isEligible
        ? `\n\nNotice: our ${abandonmentDays}-day storage period has passed and the item is eligible for disposal.`
        : '';
      message = `Hello ${customerName}! This is ${shopName}. Your ${appliance} (Order #${entry.item.tag}) ${statusText}.${policyNote}\n\nPlease let us know when you can pick it up.`;
    }

    const waUrl = `https://wa.me/${buildWhatsappPhone(phone)}?text=${encodeURIComponent(message)}`;
    void Linking.openURL(waUrl);
  };

  const handleRefresh = () => {
    void staleQuery.refetch();
    void eligibleQuery.refetch();
  };

  const isLoading = staleQuery.isLoading || eligibleQuery.isLoading;
  const isRefreshing = staleQuery.isRefetching || eligibleQuery.isRefetching;

  const filterChips: { key: StaleFilter; label: string }[] = [
    { key: 'ALL', label: `${locale === 'pt-BR' ? 'Todos' : 'All'} (${counts.ALL})` },
    { key: 'OVER_30', label: `+30d (${counts.OVER_30})` },
    { key: 'OVER_90', label: `+90d (${counts.OVER_90})` },
    {
      key: 'ELIGIBLE',
      label: `${locale === 'pt-BR' ? 'Descarte' : 'Discard'} (${counts.ELIGIBLE})`,
    },
  ];

  const renderCard = ({ item: entry }: { item: (typeof enrichedItems)[number] }) => {
    const { item, waitingDays, isEligible, daysUntilDiscard } = entry;
    const appliance = [item.applianceType, item.brand, item.model].filter(Boolean).join(' ');

    return (
      <View style={[styles.card, isEligible && styles.cardEligible]}>
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/orders/[orderId]/items/[itemId]',
              params: { orderId: item.serviceOrderId, itemId: item.id },
            })
          }
          style={styles.cardBody}
        >
          <View style={styles.cardTopRow}>
            <View style={styles.tagGroup}>
              <TagBadge label={`#${item.tag}`} variant="dark" />
              <View
                style={[
                  styles.ageBadge,
                  isEligible
                    ? styles.ageBadgeDanger
                    : waitingDays >= 30
                      ? styles.ageBadgeWarn
                      : styles.ageBadgeNeutral,
                ]}
              >
                <Clock
                  size={11}
                  color={
                    isEligible
                      ? colors.dangerDark
                      : waitingDays >= 30
                        ? colors.warningDark
                        : colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.ageBadgeText,
                    isEligible
                      ? styles.ageTextDanger
                      : waitingDays >= 30
                        ? styles.ageTextWarn
                        : styles.ageTextNeutral,
                  ]}
                >
                  {locale === 'pt-BR'
                    ? waitingDays === 0
                      ? 'Hoje'
                      : `${waitingDays}d parado`
                    : waitingDays === 0
                      ? 'Today'
                      : `${waitingDays}d waiting`}
                </Text>
              </View>
            </View>
            <StatusBadge status={item.status} />
          </View>

          <Text style={styles.applianceTitle} numberOfLines={1}>
            {appliance}
          </Text>

          <View style={styles.customerRow}>
            <View style={styles.customerLeft}>
              <User size={13} color={colors.textMuted} />
              <Text style={styles.customerName} numberOfLines={1}>
                {item.customerName ?? '—'}
                {item.customerPhone ? ` · ${formatPhone(item.customerPhone)}` : ''}
              </Text>
            </View>
            {Number(item.totalPrice) > 0 && item.status === 'READY_FOR_PICKUP' ? (
              <Text style={styles.priceText}>{formatCurrency(item.totalPrice)}</Text>
            ) : null}
          </View>

          <View style={styles.policyHintRow}>
            {isEligible ? (
              <>
                <AlertTriangle size={13} color={colors.danger} />
                <Text style={styles.policyHintDanger}>
                  {locale === 'pt-BR'
                    ? `Prazo de ${abandonmentDays}d atingido — elegível para descarte`
                    : `${abandonmentDays}d abandonment limit reached — eligible for discard`}
                </Text>
              </>
            ) : (
              <Text style={styles.policyHintMuted}>
                {locale === 'pt-BR'
                  ? `Faltam ${daysUntilDiscard} dias para atingir o prazo de abandono (${abandonmentDays}d)`
                  : `${daysUntilDiscard} days remaining until abandonment threshold (${abandonmentDays}d)`}
              </Text>
            )}
          </View>
        </Pressable>

        <View style={styles.actionsBar}>
          <Pressable
            onPress={() => handleSendWhatsappReminder(entry)}
            style={({ pressed }) => [styles.waActionBtn, pressed && styles.actionPressed]}
          >
            <MessageCircle size={15} color={colors.successDark} />
            <Text style={styles.waActionText}>
              {locale === 'pt-BR' ? 'Cobrar retirada' : 'Remind via WhatsApp'}
            </Text>
          </Pressable>

          {isEligible ? (
            <Pressable
              disabled={discardMutation.isPending}
              onPress={() => handleConfirmDiscard(entry)}
              style={({ pressed }) => [styles.discardActionBtn, pressed && styles.actionPressed]}
            >
              <Trash2 size={15} color={colors.danger} />
              <Text style={styles.discardActionText}>
                {locale === 'pt-BR' ? 'Descartar' : 'Discard'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.navBtn} hitSlop={8}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.topTitle}>
          {locale === 'pt-BR' ? 'Parados & Descarte' : 'Stale & Discard'}
        </Text>
        <View style={styles.policyBadge}>
          <Text style={styles.policyBadgeText}>{abandonmentDays}d</Text>
        </View>
      </View>

      <FlatList
        data={visibleItems}
        keyExtractor={(entry) => entry.item.id}
        renderItem={renderCard}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brandPrimary}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {/* Summary KPI Strip */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryTile}>
                <Text style={styles.summaryLabel}>
                  {locale === 'pt-BR' ? 'PRATELEIRA' : 'ON SHELF'}
                </Text>
                <Text style={styles.summaryValue}>{counts.ALL}</Text>
              </View>
              <View style={[styles.summaryTile, counts.OVER_30 > 0 && styles.summaryTileWarn]}>
                <Text style={styles.summaryLabel}>+30 DIAS</Text>
                <Text
                  style={[
                    styles.summaryValue,
                    counts.OVER_30 > 0 && { color: colors.warningDark },
                  ]}
                >
                  {counts.OVER_30}
                </Text>
              </View>
              <View style={[styles.summaryTile, counts.ELIGIBLE > 0 && styles.summaryTileDanger]}>
                <Text style={styles.summaryLabel}>
                  {locale === 'pt-BR' ? 'DESCARTE' : 'ELIGIBLE'}
                </Text>
                <Text
                  style={[
                    styles.summaryValue,
                    counts.ELIGIBLE > 0 && { color: colors.dangerDark },
                  ]}
                >
                  {counts.ELIGIBLE}
                </Text>
              </View>
            </View>

            {/* Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              {filterChips.map((chip) => {
                const active = filter === chip.key;
                const isDiscardChip = chip.key === 'ELIGIBLE';
                return (
                  <Pressable
                    key={chip.key}
                    onPress={() => setFilter(chip.key)}
                    style={[
                      styles.chip,
                      active && (isDiscardChip ? styles.chipDangerActive : styles.chipActive),
                    ]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.brandPrimary} />
              <Text style={styles.centerText}>{t.common.loading}</Text>
            </View>
          ) : (
            <View style={styles.centerBox}>
              <View style={styles.emptyIconCircle}>
                <Archive size={24} color={colors.brandPrimary} />
              </View>
              <Text style={styles.emptyTitle}>
                {filter === 'ELIGIBLE'
                  ? locale === 'pt-BR'
                    ? 'Nenhum aparelho elegível para descarte'
                    : 'No items eligible for discard'
                  : locale === 'pt-BR'
                    ? 'Prateleira em dia!'
                    : 'Shelf is clear!'}
              </Text>
              <Text style={styles.centerText}>
                {filter === 'ELIGIBLE'
                  ? locale === 'pt-BR'
                    ? `Aparelhos prontos ou recusados há mais de ${abandonmentDays} dias aparecerão aqui para descarte auditável.`
                    : `Items ready or rejected for more than ${abandonmentDays} days will appear here.`
                  : locale === 'pt-BR'
                    ? 'Nenhum aparelho aguardando retirada neste filtro.'
                    : 'No appliances waiting for pickup under this filter.'}
              </Text>
              {filter !== 'ALL' ? (
                <Button
                  label={locale === 'pt-BR' ? 'Ver todos parados' : 'Show all waiting'}
                  variant="secondary"
                  fullWidth={false}
                  onPress={() => setFilter('ALL')}
                />
              ) : null}
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgCanvas,
  },
  topBar: {
    height: 56,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  policyBadge: {
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  policyBadgeText: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    color: colors.textSecondary,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 40,
    gap: 12,
  },
  headerBlock: {
    gap: 12,
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryTile: {
    flex: 1,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: 12,
    gap: 4,
  },
  summaryTileWarn: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder,
  },
  summaryTileDanger: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  summaryLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
  summaryValue: {
    fontFamily: fonts.monoBold,
    fontSize: 20,
    color: colors.textPrimary,
  },
  chipsRow: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: colors.darkPillBg,
    borderColor: colors.darkPillBg,
  },
  chipDangerActive: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  chipText: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.textPrimary,
  },
  chipTextActive: {
    color: colors.textOnDark,
  },
  card: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  cardEligible: {
    borderColor: colors.dangerBorder,
  },
  cardBody: {
    padding: spacing.lg,
    gap: 8,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tagGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  ageBadgeNeutral: {
    backgroundColor: colors.bgSubtle,
    borderColor: colors.borderSubtle,
  },
  ageBadgeWarn: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder,
  },
  ageBadgeDanger: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  ageBadgeText: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
  },
  ageTextNeutral: {
    color: colors.textSecondary,
  },
  ageTextWarn: {
    color: colors.warningDark,
  },
  ageTextDanger: {
    color: colors.dangerDark,
  },
  applianceTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 15.5,
    color: colors.textPrimary,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  customerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  customerName: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12.5,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  priceText: {
    fontFamily: fonts.monoBold,
    fontSize: 13.5,
    color: colors.textPrimary,
  },
  policyHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  },
  policyHintDanger: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    color: colors.dangerDark,
  },
  policyHintMuted: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: 11.5,
    color: colors.textMuted,
  },
  actionsBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bgCanvas,
  },
  waActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  waActionText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.successDark,
  },
  discardActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderSubtle,
    backgroundColor: colors.dangerSoft,
  },
  discardActionText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.danger,
  },
  actionPressed: {
    opacity: 0.75,
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brandPrimarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 16,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  centerText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
