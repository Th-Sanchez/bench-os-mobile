import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Archive, Bell, ChevronRight, Plus, Search, User, Wrench, X } from 'lucide-react-native';
import { ordersApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthProvider';
import { getWaitingDays } from '@/utils/staleItems';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TagBadge } from '@/components/ui/TagBadge';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, itemStatusStyles, radius, spacing } from '@/theme/tokens';
import type { ItemStatus, OrderItemQueueResponse } from '@/types/api';

const ACTIVE_BENCH_STATUSES: ItemStatus[] = [
  'RECEIVED',
  'DIAGNOSING',
  'QUOTE_SENT',
  'APPROVED',
  'WAITING_PARTS',
  'IN_REPAIR',
  'READY_FOR_PICKUP',
];

type FilterKey = 'ALL' | ItemStatus;

const FILTER_TABS: { key: FilterKey; dotColor?: string }[] = [
  { key: 'ALL' },
  { key: 'RECEIVED', dotColor: itemStatusStyles.RECEIVED.dot },
  { key: 'DIAGNOSING', dotColor: itemStatusStyles.DIAGNOSING.dot },
  { key: 'QUOTE_SENT', dotColor: itemStatusStyles.QUOTE_SENT.dot },
  { key: 'WAITING_PARTS', dotColor: itemStatusStyles.WAITING_PARTS.dot },
  { key: 'IN_REPAIR', dotColor: itemStatusStyles.IN_REPAIR.dot },
  { key: 'READY_FOR_PICKUP', dotColor: itemStatusStyles.READY_FOR_PICKUP.dot },
];

const TAG_QUERY_PATTERN = /^#?(\d+(?:-\d+)?)$/;

function formatRelativeTime(iso: string, locale: 'pt-BR' | 'en'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const isSameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  if (isSameDay) {
    return `${locale === 'pt-BR' ? 'Hoje' : 'Today'}, ${hours}:${minutes}`;
  }
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month} ${hours}:${minutes}`;
}

export default function WorkbenchScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { t, locale, formatCurrency, formatShortDate } = useI18n();

  const [selectedFilter, setSelectedFilter] = useState<FilterKey>('ALL');
  const [searchText, setSearchText] = useState('');

  const trimmedSearch = searchText.trim();
  const tagMatch = trimmedSearch.match(TAG_QUERY_PATTERN);
  const serverTagParam = tagMatch ? tagMatch[1] : undefined;

  const queueQuery = useQuery({
    queryKey: ['bench-queue', serverTagParam ?? ''],
    queryFn: () =>
      ordersApi.listBenchQueue({
        status: ACTIVE_BENCH_STATUSES,
        tag: serverTagParam,
        page: 0,
        size: 100,
      }),
  });

  const abandonmentSummaryQuery = useQuery({
    queryKey: ['abandonment-eligible-summary'],
    queryFn: () => ordersApi.listAbandonmentEligible({ page: 0, size: 1 }),
  });

  const allItems = useMemo(
    () => queueQuery.data?.content ?? [],
    [queueQuery.data]
  );

  const eligibleDiscardCount = abandonmentSummaryQuery.data?.totalElements ?? 0;
  const staleOver30Count = useMemo(() => {
    return allItems.filter(
      (item) => item.status === 'READY_FOR_PICKUP' && getWaitingDays(item) >= 30
    ).length;
  }, [allItems]);
  const staleAlertCount = Math.max(eligibleDiscardCount, staleOver30Count);

  const countsByStatus = useMemo(() => {
    const counts: Record<string, number> = { ALL: allItems.length };
    for (const item of allItems) {
      counts[item.status] = (counts[item.status] ?? 0) + 1;
    }
    return counts;
  }, [allItems]);

  const visibleItems = useMemo(() => {
    const queryLower = trimmedSearch.toLowerCase();
    return allItems.filter((item) => {
      if (selectedFilter !== 'ALL' && item.status !== selectedFilter) {
        return false;
      }
      if (!trimmedSearch || serverTagParam) {
        return true;
      }
      const haystack = [
        item.tag,
        item.customerName ?? '',
        item.applianceType,
        item.brand,
        item.model ?? '',
        item.reportedIssue,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(queryLower);
    });
  }, [allItems, selectedFilter, trimmedSearch, serverTagParam]);

  const shopName = session?.tenant.name ?? 'BenchOS';
  const userInitials = (session?.user.name ?? 'B')
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  const renderItem = ({ item }: { item: OrderItemQueueResponse }) => {
    const applianceTitle = [item.applianceType, item.brand, item.model]
      .filter(Boolean)
      .join(' ');

    const hasPrice = item.totalPrice > 0;
    const rightMeta = hasPrice ? (
      <Text style={styles.cardPrice}>{formatCurrency(item.totalPrice)}</Text>
    ) : item.estimatedCompletionDate ? (
      <Text style={styles.cardDeadline}>
        {locale === 'pt-BR' ? 'Prazo: ' : 'Due: '}
        {formatShortDate(item.estimatedCompletionDate)}
      </Text>
    ) : (
      <Text style={styles.cardTimestamp}>{formatRelativeTime(item.createdAt, locale)}</Text>
    );

    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: '/orders/[orderId]/items/[itemId]',
            params: { orderId: item.serviceOrderId, itemId: item.id },
          })
        }
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <View style={styles.tagGroup}>
              <TagBadge label={`#${item.tag}`} variant="dark" />
              <TagBadge label={t.voltage[item.voltage]} variant="subtle" />
            </View>
            <StatusBadge status={item.status} />
          </View>

          <View style={styles.cardTextGroup}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {applianceTitle}
            </Text>
            <Text style={styles.cardIssue} numberOfLines={2}>
              {item.reportedIssue}
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.customerRow}>
            <User size={13} color={colors.textSecondary} />
            <Text style={styles.customerName} numberOfLines={1}>
              {item.customerName ?? '—'}
            </Text>
          </View>
          {rightMeta}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Top App Bar */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>{t.tabs.workbench}</Text>
        <View style={styles.topBarActions}>
          <Pressable
            onPress={() => router.push('/orders/stale')}
            style={styles.iconBtn}
            accessibilityLabel={locale === 'pt-BR' ? 'Parados e descarte' : 'Stale and discard'}
          >
            <Archive
              size={20}
              color={eligibleDiscardCount > 0 ? colors.danger : colors.textPrimary}
              strokeWidth={2}
            />
            {staleAlertCount > 0 ? (
              <View
                style={[
                  styles.iconBadge,
                  eligibleDiscardCount > 0 ? styles.iconBadgeDanger : styles.iconBadgeWarn,
                ]}
              >
                <Text style={styles.iconBadgeText}>
                  {staleAlertCount > 99 ? '99+' : staleAlertCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => {
              void queueQuery.refetch();
              void abandonmentSummaryQuery.refetch();
            }}
            style={styles.iconBtn}
            accessibilityLabel="Refresh"
          >
            <Bell size={20} color={colors.textPrimary} strokeWidth={2} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/(tabs)/settings')}
            style={styles.avatarBadge}
          >
            <Text style={styles.avatarText}>{userInitials || 'U'}</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={queueQuery.isRefetching}
            onRefresh={() => {
              void queueQuery.refetch();
              void abandonmentSummaryQuery.refetch();
            }}
            tintColor={colors.brandPrimary}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            {/* Shop & Queue Headline */}
            <View style={styles.headlineRow}>
              <View>
                <Text style={styles.shopOverline}>{shopName.toUpperCase()}</Text>
                <Text style={styles.screenHeadline}>
                  {locale === 'pt-BR' ? 'Fila da Bancada' : 'Workbench Queue'}
                </Text>
              </View>
              <View style={styles.activeCountPill}>
                <View style={styles.activeCountDot} />
                <Text style={styles.activeCountText}>
                  {allItems.length} {locale === 'pt-BR' ? 'ativos' : 'active'}
                </Text>
              </View>
            </View>

            {/* Search Bar */}
            <View style={styles.searchWrapper}>
              <Search size={17} color={colors.textMuted} />
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder={
                  locale === 'pt-BR'
                    ? 'Buscar etiqueta (ex: 1042-1) ou cliente...'
                    : 'Search tag (e.g. 1042-1) or customer...'
                }
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
                autoCorrect={false}
              />
              {searchText.length > 0 ? (
                <Pressable onPress={() => setSearchText('')} hitSlop={8}>
                  <X size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            {/* Stale / Discard Alert Callout */}
            {staleAlertCount > 0 ? (
              <Pressable
                onPress={() => router.push('/orders/stale')}
                style={({ pressed }) => [
                  styles.staleBanner,
                  eligibleDiscardCount > 0 ? styles.staleBannerDanger : styles.staleBannerWarn,
                  pressed && styles.staleBannerPressed,
                ]}
              >
                <View style={styles.staleBannerLeft}>
                  <Archive
                    size={16}
                    color={eligibleDiscardCount > 0 ? colors.dangerDark : colors.warningDark}
                  />
                  <Text
                    style={[
                      styles.staleBannerText,
                      eligibleDiscardCount > 0
                        ? styles.staleBannerTextDanger
                        : styles.staleBannerTextWarn,
                    ]}
                    numberOfLines={2}
                  >
                    {eligibleDiscardCount > 0
                      ? locale === 'pt-BR'
                        ? `${eligibleDiscardCount} ${eligibleDiscardCount === 1 ? 'aparelho elegível' : 'aparelhos elegíveis'} para descarte`
                        : `${eligibleDiscardCount} item(s) eligible for discard`
                      : locale === 'pt-BR'
                        ? `${staleOver30Count} ${staleOver30Count === 1 ? 'aparelho parado' : 'aparelhos parados'} há mais de 30 dias`
                        : `${staleOver30Count} item(s) waiting over 30 days`}
                  </Text>
                </View>
                <ChevronRight
                  size={16}
                  color={eligibleDiscardCount > 0 ? colors.dangerDark : colors.warningDark}
                />
              </Pressable>
            ) : null}

            {/* Horizontal Status Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              {FILTER_TABS.map((tab) => {
                const isActive = selectedFilter === tab.key;
                const count = countsByStatus[tab.key] ?? 0;
                const label = tab.key === 'ALL' ? t.common.all : t.status[tab.key];

                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => setSelectedFilter(tab.key)}
                    style={[styles.chip, isActive && styles.chipActive]}
                  >
                    {!isActive && tab.dotColor ? (
                      <View style={[styles.chipDot, { backgroundColor: tab.dotColor }]} />
                    ) : null}
                    <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                      {label} ({count})
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          queueQuery.isLoading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.brandPrimary} />
              <Text style={styles.centerText}>{t.common.loading}</Text>
            </View>
          ) : queueQuery.isError ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorTitle}>
                {locale === 'pt-BR'
                  ? 'Não foi possível carregar a bancada'
                  : 'Unable to load workbench'}
              </Text>
              <Text style={styles.centerText}>
                {queueQuery.error instanceof Error
                  ? queueQuery.error.message
                  : t.common.errorGeneric}
              </Text>
              <Button
                label={t.common.retry}
                variant="secondary"
                fullWidth={false}
                onPress={() => queueQuery.refetch()}
              />
            </View>
          ) : (
            <View style={styles.centerBox}>
              <View style={styles.emptyIconCircle}>
                <Wrench size={24} color={colors.brandPrimary} />
              </View>
              <Text style={styles.emptyTitle}>
                {locale === 'pt-BR' ? 'Nenhum aparelho nesta fila' : 'No appliances in this queue'}
              </Text>
              <Text style={styles.centerText}>
                {locale === 'pt-BR'
                  ? 'Toque em "+ Nova OS" para registrar a entrada de um aparelho no balcão.'
                  : 'Tap "+ New Order" to check in an appliance at the counter.'}
              </Text>
            </View>
          )
        }
      />

      {/* Floating Action Button: + Nova OS */}
      <Pressable
        onPress={() => router.push('/orders/new')}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
      >
        <Plus size={18} color={colors.textOnDark} strokeWidth={2.5} />
        <Text style={styles.fabLabel}>{locale === 'pt-BR' ? 'Nova OS' : 'New Order'}</Text>
      </Pressable>
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
  topBarTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 18,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconBadge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadgeDanger: {
    backgroundColor: colors.danger,
  },
  iconBadgeWarn: {
    backgroundColor: colors.warning,
  },
  iconBadgeText: {
    fontFamily: fonts.monoBold,
    fontSize: 9.5,
    color: colors.textOnDark,
  },
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  staleBannerDanger: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  staleBannerWarn: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder,
  },
  staleBannerPressed: {
    opacity: 0.85,
  },
  staleBannerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  staleBannerText: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
  },
  staleBannerTextDanger: {
    color: colors.dangerDark,
  },
  staleBannerTextWarn: {
    color: colors.warningDark,
  },
  avatarBadge: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.textOnDark,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 96,
    gap: 10,
  },
  headerContainer: {
    gap: 14,
    marginBottom: 6,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  shopOverline: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    letterSpacing: 0.7,
    color: colors.textMuted,
  },
  screenHeadline: {
    fontFamily: fonts.headlineBold,
    fontSize: 22,
    letterSpacing: -0.35,
    color: colors.textPrimary,
  },
  activeCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  activeCountDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.brandPrimary,
  },
  activeCountText: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.infoDark,
  },
  searchWrapper: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  chipsRow: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  chipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
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
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  cardPressed: {
    borderColor: colors.brandPrimary,
    backgroundColor: '#FCFDFF',
  },
  cardBody: {
    padding: spacing.lg,
    gap: 10,
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
  cardTextGroup: {
    gap: 3,
  },
  cardTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  cardIssue: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F4F7FF',
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    gap: 12,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  customerName: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12.5,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  cardPrice: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  cardDeadline: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.warningDark,
  },
  cardTimestamp: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textMuted,
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
  errorTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 16,
    color: colors.dangerDark,
    textAlign: 'center',
  },
  centerText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 18,
    height: 50,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: colors.brandPrimary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  fabPressed: {
    backgroundColor: colors.brandPrimaryPressed,
  },
  fabLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.textOnDark,
  },
});
