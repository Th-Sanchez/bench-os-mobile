import React, { useState } from 'react';
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
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  PackageCheck,
  Search,
  ShoppingCart,
  X,
} from 'lucide-react-native';
import { partRequestsApi } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { useAuth } from '@/auth/AuthProvider';
import {
  ArrivePartRequestMobileModal,
  PartRequestStatusPill,
} from '@/components/orders/ItemPartRequestsSection';
import { TagBadge } from '@/components/ui/TagBadge';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { PartRequestResponse, PartRequestStatus } from '@/types/api';

type QueueFilter = 'PENDING' | 'TO_ORDER' | 'ORDERED' | 'ARRIVED';

export default function PartRequestsQueueScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { locale, t, formatCurrency } = useI18n();

  const canWrite = session?.user.role === 'OWNER' || session?.user.role === 'TECHNICIAN';

  const [filter, setFilter] = useState<QueueFilter>('PENDING');
  const [search, setSearch] = useState('');
  const [arriving, setArriving] = useState<PartRequestResponse | null>(null);

  const statuses: PartRequestStatus[] =
    filter === 'PENDING' ? ['TO_ORDER', 'ORDERED'] : [filter];

  const summaryQuery = useQuery({
    queryKey: ['part-requests-summary'],
    queryFn: () => partRequestsApi.getSummary(),
  });

  const queueQuery = useQuery({
    queryKey: ['part-requests-queue', filter, search.trim()],
    queryFn: () =>
      partRequestsApi.listQueue({
        status: statuses,
        query: search.trim() || undefined,
        size: 100,
      }),
  });

  const markOrderedMutation = useMutation({
    mutationFn: (id: string) => partRequestsApi.markOrdered(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['part-requests-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['part-requests-summary'] }),
      ]);
    },
    onError: (err) => {
      Alert.alert(
        locale === 'pt-BR' ? 'Erro' : 'Error',
        err instanceof ApiError ? err.message : t.common.errorGeneric
      );
    },
  });

  const summary = summaryQuery.data;
  const items = queueQuery.data?.content ?? [];

  const renderItem = ({ item: req }: { item: PartRequestResponse }) => {
    const isPending = req.status === 'TO_ORDER' || req.status === 'ORDERED';
    return (
      <View style={styles.card}>
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/orders/[orderId]/items/[itemId]',
              params: { orderId: req.serviceOrderId, itemId: req.serviceOrderItemId },
            })
          }
          style={styles.cardHeader}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.topRow}>
              <TagBadge label={`#${req.itemTag}`} variant="dark" />
              <PartRequestStatusPill status={req.status} locale={locale} />
            </View>
            <Text style={styles.partName}>
              {req.quantity > 1 ? `${req.quantity}x ` : ''}
              {req.partName}
            </Text>
            <Text style={styles.applianceText} numberOfLines={1}>
              {req.applianceDisplayName}
              {req.customerName ? ` · ${req.customerName}` : ''}
            </Text>
            {req.supplierName ? (
              <Text style={styles.supplierText}>{req.supplierName}</Text>
            ) : null}
          </View>
          <View style={styles.rightCol}>
            <Text style={styles.costText}>{formatCurrency(req.effectiveTotalCost)}</Text>
            <ChevronRight size={16} color={colors.textMuted} />
          </View>
        </Pressable>

        {req.purchaseUrl ? (
          <Pressable
            onPress={() => void Linking.openURL(req.purchaseUrl!)}
            style={styles.urlRow}
          >
            <ExternalLink size={13} color={colors.brandPrimary} />
            <Text style={styles.urlText} numberOfLines={1}>
              {locale === 'pt-BR' ? 'Abrir link de compra' : 'Open purchase link'}
            </Text>
          </Pressable>
        ) : null}

        {canWrite && isPending ? (
          <View style={styles.actionsRow}>
            {req.status === 'TO_ORDER' ? (
              <Pressable
                onPress={() => markOrderedMutation.mutate(req.id)}
                style={styles.orderedBtn}
              >
                <ShoppingCart size={14} color={colors.infoDark} />
                <Text style={styles.orderedBtnText}>
                  {locale === 'pt-BR' ? 'Pedido feito' : 'Mark Ordered'}
                </Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => setArriving(req)} style={styles.arrivedBtn}>
              <PackageCheck size={14} color={colors.textOnDark} />
              <Text style={styles.arrivedBtnText}>
                {locale === 'pt-BR' ? 'Chegou (Dar baixa)' : 'Arrived'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.navTitle}>
            {locale === 'pt-BR' ? 'Fila de Compras' : 'Shopping Queue'}
          </Text>
          <Text style={styles.navSubtitle}>
            {locale === 'pt-BR'
              ? 'Peças sob demanda vinculadas às OS'
              : 'On-demand parts linked to service orders'}
          </Text>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={queueQuery.isRefetching}
            onRefresh={() => {
              void queueQuery.refetch();
              void summaryQuery.refetch();
            }}
            tintColor={colors.brandPrimary}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {/* Summary KPIs */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <Text style={[styles.kpiLabel, { color: colors.warningDark }]}>
                  {locale === 'pt-BR' ? 'A PEDIR' : 'TO ORDER'}
                </Text>
                <Text style={styles.kpiValue}>{summary?.toOrderCount ?? 0}</Text>
                <Text style={styles.kpiCost}>
                  {formatCurrency(summary?.estimatedToOrderCost ?? 0)}
                </Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={[styles.kpiLabel, { color: colors.infoDark }]}>
                  {locale === 'pt-BR' ? 'PEDIDO FEITO' : 'ORDERED'}
                </Text>
                <Text style={styles.kpiValue}>{summary?.orderedCount ?? 0}</Text>
                <Text style={styles.kpiCost}>
                  {formatCurrency(summary?.estimatedOrderedCost ?? 0)}
                </Text>
              </View>
            </View>

            {/* Search */}
            <View style={styles.searchWrapper}>
              <Search size={16} color={colors.textMuted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={
                  locale === 'pt-BR'
                    ? 'Buscar peça, fornecedor ou #OS...'
                    : 'Search part, supplier or #OS...'
                }
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
              />
              {search.length > 0 ? (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <X size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            {/* Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              {(
                [
                  { id: 'PENDING', pt: 'Pendentes', en: 'Pending' },
                  { id: 'TO_ORDER', pt: 'A pedir', en: 'To order' },
                  { id: 'ORDERED', pt: 'Pedido feito', en: 'Ordered' },
                  { id: 'ARRIVED', pt: 'Chegaram', en: 'Arrived' },
                ] as const
              ).map((chip) => {
                const active = filter === chip.id;
                return (
                  <Pressable
                    key={chip.id}
                    onPress={() => setFilter(chip.id)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {locale === 'pt-BR' ? chip.pt : chip.en}
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
            </View>
          ) : (
            <View style={styles.centerBox}>
              <ShoppingCart size={36} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {locale === 'pt-BR'
                  ? 'Nenhuma peça nesta fila'
                  : 'No parts in this queue'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {locale === 'pt-BR'
                  ? 'Abra qualquer OS e toque em "+ Pedir" na seção Peças Necessárias.'
                  : 'Open any order item and tap "+ Request" in Required Parts.'}
              </Text>
            </View>
          )
        }
      />

      <ArrivePartRequestMobileModal
        request={arriving}
        onClose={() => setArriving(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgCanvas,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSubtle,
  },
  navTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  navSubtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textMuted,
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: 40,
  },
  headerBlock: {
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 2,
  },
  kpiLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontFamily: fonts.headlineBold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  kpiCost: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  chipsRow: {
    gap: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipActive: {
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandPrimary,
  },
  chipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.textOnDark,
  },
  card: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  partName: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  applianceText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  supplierText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textMuted,
  },
  rightCol: {
    alignItems: 'flex-end',
    gap: 6,
  },
  costText: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  urlText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.brandPrimary,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.sm,
  },
  orderedBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.infoSoft,
    borderColor: colors.infoBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 9,
  },
  orderedBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.infoDark,
  },
  arrivedBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingVertical: 9,
  },
  arrivedBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.textOnDark,
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
});
