import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardList,
  MessageCircle,
  Phone,
  Plus,
  Search,
  User,
  Wrench,
  X,
} from 'lucide-react-native';
import { ordersApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthProvider';
import {
  inferWhatsappStageFromStatuses,
  WhatsappStageModal,
} from '@/components/orders/WhatsappStageModal';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { ItemStatus, ServiceOrderItemResponse, ServiceOrderResponse } from '@/types/api';

type OrderFilter = 'ALL' | 'OPEN' | 'READY' | 'COMPLETED';

const TERMINAL_STATUSES = new Set<ItemStatus>([
  'DELIVERED',
  'REJECTED',
  'DISCARDED',
  'CANCELLED',
]);

const ORDER_NUMBER_PATTERN = /^#?(\d+)$/;

function isOrderCompleted(order: ServiceOrderResponse): boolean {
  return order.items.length > 0 && order.items.every((item) => TERMINAL_STATUSES.has(item.status));
}

function hasReadyItem(order: ServiceOrderResponse): boolean {
  return order.items.some((item) => item.status === 'READY_FOR_PICKUP');
}

function hasOpenItem(order: ServiceOrderResponse): boolean {
  return order.items.some(
    (item) => !TERMINAL_STATUSES.has(item.status) && item.status !== 'READY_FOR_PICKUP'
  );
}

function computeOrderTotal(items: ServiceOrderItemResponse[]): number {
  return items.reduce((acc, item) => acc + (Number(item.totalPrice) || 0), 0);
}

function formatApplianceLabel(item: ServiceOrderItemResponse): string {
  const parts = [item.applianceType, item.brand, item.model].filter(
    (part): part is string => Boolean(part && part.trim().length > 0)
  );
  return parts.join(' ');
}

export default function OrdersScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { locale, formatCurrency, formatPhone, formatShortDate } = useI18n();

  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState<OrderFilter>('ALL');
  const [whatsappOrder, setWhatsappOrder] = useState<ServiceOrderResponse | null>(null);

  const trimmedSearch = searchText.trim();
  const numberMatch = trimmedSearch.match(ORDER_NUMBER_PATTERN);
  const parsedOrderNumber = numberMatch ? Number(numberMatch[1]) : undefined;

  const ordersQuery = useQuery({
    queryKey: ['orders-list', parsedOrderNumber ?? 'all'],
    queryFn: () =>
      ordersApi.list({
        orderNumber: parsedOrderNumber,
        page: 0,
        size: 60,
      }),
  });

  const allOrders = useMemo(
    () => ordersQuery.data?.content ?? [],
    [ordersQuery.data]
  );
  const totalElements = ordersQuery.data?.totalElements ?? allOrders.length;

  const filteredOrders = useMemo(() => {
    const queryLower = trimmedSearch.toLowerCase();

    return allOrders.filter((order) => {
      if (filter === 'OPEN' && !hasOpenItem(order)) return false;
      if (filter === 'READY' && !hasReadyItem(order)) return false;
      if (filter === 'COMPLETED' && !isOrderCompleted(order)) return false;

      if (!trimmedSearch || parsedOrderNumber !== undefined) {
        return true;
      }

      const itemText = order.items
        .map((item) => `${item.tag} ${item.applianceType} ${item.brand} ${item.model ?? ''}`)
        .join(' ');

      const haystack = [
        `#${order.orderNumber}`,
        order.customerName ?? '',
        order.customerPhone ?? '',
        itemText,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(queryLower);
    });
  }, [allOrders, filter, parsedOrderNumber, trimmedSearch]);

  const activeSummary = useMemo(() => {
    let activeItems = 0;
    let readyItems = 0;
    for (const order of allOrders) {
      for (const item of order.items) {
        if (!TERMINAL_STATUSES.has(item.status)) {
          activeItems += 1;
          if (item.status === 'READY_FOR_PICKUP') {
            readyItems += 1;
          }
        }
      }
    }
    return { activeItems, readyItems };
  }, [allOrders]);

  const filterChips: { key: OrderFilter; label: string }[] = [
    { key: 'ALL', label: locale === 'pt-BR' ? 'Todas' : 'All' },
    { key: 'OPEN', label: locale === 'pt-BR' ? 'Em aberto' : 'Open' },
    { key: 'READY', label: locale === 'pt-BR' ? 'Prontas' : 'Ready' },
    { key: 'COMPLETED', label: locale === 'pt-BR' ? 'Finalizadas' : 'Completed' },
  ];

  const openItemDetail = (orderId: string, itemId: string) => {
    router.push({
      pathname: '/orders/[orderId]/items/[itemId]',
      params: { orderId, itemId },
    });
  };

  const handleCallCustomer = (phone: string | null) => {
    if (!phone) return;
    const digits = phone.replace(/\D/g, '');
    if (digits.length > 0) {
      void Linking.openURL(`tel:${digits}`);
    }
  };

  const renderOrderCard = ({ item: order }: { item: ServiceOrderResponse }) => {
    const completed = isOrderCompleted(order);
    const total = computeOrderTotal(order.items);
    const itemCount = order.items.length;
    const itemCountLabel =
      locale === 'pt-BR'
        ? `${itemCount} ${itemCount === 1 ? 'aparelho' : 'aparelhos'}`
        : `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;

    return (
      <View style={[styles.orderCard, completed && styles.orderCardCompleted]}>
        {/* Header Row */}
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.osBadge, completed && styles.osBadgeCompleted]}>
              <Text style={styles.osBadgeText}>OS #{order.orderNumber}</Text>
            </View>
            <Text style={styles.cardMetaText} numberOfLines={1}>
              {formatShortDate(order.createdAt)} · {itemCountLabel}
            </Text>
          </View>
          <Text style={styles.cardTotalText}>
            {total > 0 ? formatCurrency(total) : '—'}
          </Text>
        </View>

        {/* Customer Row */}
        <View style={styles.customerRow}>
          <View style={styles.customerLeft}>
            <View style={styles.customerAvatar}>
              <User size={13} color={colors.brandPrimary} strokeWidth={2.2} />
            </View>
            <Text style={styles.customerName} numberOfLines={1}>
              {order.customerName || (locale === 'pt-BR' ? 'Cliente' : 'Customer')}
            </Text>
          </View>
          <View style={styles.customerActions}>
            {order.customerPhone ? (
              <Pressable
                onPress={() => handleCallCustomer(order.customerPhone)}
                hitSlop={8}
                style={styles.phoneLink}
              >
                <Phone size={11} color={colors.textMuted} strokeWidth={2} />
                <Text style={styles.phoneText}>{formatPhone(order.customerPhone)}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setWhatsappOrder(order)}
              hitSlop={6}
              style={styles.waIconBtn}
              accessibilityLabel="WhatsApp"
            >
              <MessageCircle size={14} color={colors.successDark} strokeWidth={2.2} />
            </Pressable>
          </View>
        </View>

        {/* Nested Appliance Rows */}
        <View style={styles.itemsContainer}>
          {order.items.map((appliance) => (
            <Pressable
              key={appliance.id}
              onPress={() => openItemDetail(order.id, appliance.id)}
              style={({ pressed }) => [
                styles.applianceRow,
                pressed && styles.applianceRowPressed,
              ]}
            >
              <View style={styles.applianceLeft}>
                <View style={styles.itemTagPill}>
                  <Text style={styles.itemTagText}>#{appliance.tag}</Text>
                </View>
                <Text style={styles.applianceTitle} numberOfLines={1}>
                  {formatApplianceLabel(appliance)}
                </Text>
              </View>
              <StatusBadge status={appliance.status} />
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  const renderFooter = () => {
    if (allOrders.length === 0) return null;
    return (
      <Pressable
        onPress={() => router.push('/(tabs)/workbench')}
        style={({ pressed }) => [styles.insightCard, pressed && styles.insightCardPressed]}
      >
        <View style={styles.insightLeft}>
          <View style={styles.insightIconBox}>
            <Wrench size={18} color={colors.brandPrimary} strokeWidth={2.1} />
          </View>
          <View style={styles.insightCopy}>
            <Text style={styles.insightTitle}>
              {locale === 'pt-BR' ? 'Resumo da Bancada' : 'Workbench Snapshot'}
            </Text>
            <Text style={styles.insightSubtitle}>
              {locale === 'pt-BR'
                ? `${activeSummary.activeItems} em andamento · ${activeSummary.readyItems} prontos p/ retirada`
                : `${activeSummary.activeItems} active · ${activeSummary.readyItems} ready for pickup`}
            </Text>
          </View>
        </View>
        <View style={styles.insightBadge}>
          <Text style={styles.insightBadgeText}>{activeSummary.activeItems}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View>
            <Text style={styles.shopName} numberOfLines={1}>
              {(session?.tenant.name ?? 'BenchOS').toUpperCase()}
            </Text>
            <Text style={styles.title}>{locale === 'pt-BR' ? 'Ordens' : 'Orders'}</Text>
          </View>
          <View style={styles.statsPill}>
            <View style={styles.statsDot} />
            <Text style={styles.statsText}>
              {totalElements}{' '}
              {locale === 'pt-BR'
                ? totalElements === 1
                  ? 'nota'
                  : 'notas'
                : totalElements === 1
                  ? 'order'
                  : 'orders'}
            </Text>
          </View>
        </View>

        {/* Search Input */}
        <View style={styles.searchBar}>
          <Search size={17} color={colors.textMuted} strokeWidth={2} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder={
              locale === 'pt-BR'
                ? 'Buscar nº da OS (ex: 1042) ou cliente...'
                : 'Search order # (e.g. 1042) or customer...'
            }
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchText.length > 0 ? (
            <Pressable
              onPress={() => setSearchText('')}
              hitSlop={10}
              accessibilityLabel={locale === 'pt-BR' ? 'Limpar busca' : 'Clear search'}
            >
              <X size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {/* Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {filterChips.map((chip) => {
            const active = filter === chip.key;
            return (
              <Pressable
                key={chip.key}
                onPress={() => setFilter(chip.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => router.push('/orders/stale')}
            style={[styles.filterChip, styles.staleLinkChip]}
          >
            <Text style={styles.staleLinkChipText}>
              {locale === 'pt-BR' ? 'Parados / Descarte' : 'Stale / Discard'}
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* Main Content */}
      {ordersQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
          <Text style={styles.stateSubtext}>
            {locale === 'pt-BR' ? 'Carregando ordens de serviço...' : 'Loading service orders...'}
          </Text>
        </View>
      ) : ordersQuery.isError ? (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>
            {locale === 'pt-BR' ? 'Não foi possível carregar as ordens' : 'Could not load orders'}
          </Text>
          <Text style={styles.stateSubtext}>
            {ordersQuery.error instanceof Error
              ? ordersQuery.error.message
              : locale === 'pt-BR'
                ? 'Verifique sua conexão e tente novamente.'
                : 'Check your connection and try again.'}
          </Text>
          <View style={styles.stateAction}>
            <Button
              label={locale === 'pt-BR' ? 'Tentar novamente' : 'Try again'}
              variant="secondary"
              fullWidth={false}
              onPress={() => {
                void ordersQuery.refetch();
              }}
            />
          </View>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrderCard}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListFooterComponent={renderFooter}
          refreshControl={
            <RefreshControl
              refreshing={ordersQuery.isRefetching}
              onRefresh={() => {
                void ordersQuery.refetch();
              }}
              tintColor={colors.brandPrimary}
              colors={[colors.brandPrimary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconCircle}>
                <ClipboardList size={24} color={colors.brandPrimary} strokeWidth={1.9} />
              </View>
              <Text style={styles.stateTitle}>
                {trimmedSearch || filter !== 'ALL'
                  ? locale === 'pt-BR'
                    ? 'Nenhuma OS encontrada'
                    : 'No orders found'
                  : locale === 'pt-BR'
                    ? 'Nenhuma ordem cadastrada'
                    : 'No service orders yet'}
              </Text>
              <Text style={styles.stateSubtext}>
                {trimmedSearch || filter !== 'ALL'
                  ? locale === 'pt-BR'
                    ? 'Tente outro filtro ou busque pelo número da OS.'
                    : 'Try another filter or search by order number.'
                  : locale === 'pt-BR'
                    ? 'Registre a primeira entrada de aparelho para acompanhar na bancada.'
                    : 'Create your first service order to start tracking repairs.'}
              </Text>
              <View style={styles.stateAction}>
                {trimmedSearch || filter !== 'ALL' ? (
                  <Button
                    label={locale === 'pt-BR' ? 'Limpar filtros' : 'Clear filters'}
                    variant="secondary"
                    fullWidth={false}
                    onPress={() => {
                      setSearchText('');
                      setFilter('ALL');
                    }}
                  />
                ) : (
                  <Button
                    label={locale === 'pt-BR' ? 'Criar primeira OS' : 'Create first order'}
                    fullWidth={false}
                    onPress={() => router.push('/orders/new')}
                  />
                )}
              </View>
            </View>
          }
        />
      )}

      {/* Floating Action Button */}
      <Pressable
        onPress={() => router.push('/orders/new')}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        accessibilityRole="button"
        accessibilityLabel={locale === 'pt-BR' ? 'Nova OS' : 'New Order'}
      >
        <Plus size={18} color={colors.textOnDark} strokeWidth={2.5} />
        <Text style={styles.fabText}>{locale === 'pt-BR' ? 'Nova OS' : 'New Order'}</Text>
      </Pressable>

      {whatsappOrder ? (
        <WhatsappStageModal
          visible={whatsappOrder !== null}
          orderId={whatsappOrder.id}
          orderNumber={whatsappOrder.orderNumber}
          itemCount={whatsappOrder.items.length}
          suggestedStage={inferWhatsappStageFromStatuses(
            whatsappOrder.items.map((i) => i.status)
          )}
          onClose={() => setWhatsappOrder(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgCanvas,
  },
  header: {
    backgroundColor: colors.bgCanvas,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  shopName: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.textMuted,
  },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: 22,
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  statsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  statsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brandPrimary,
  },
  statsText: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    color: colors.infoDark,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    minHeight: 46,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 10,
  },
  filterRow: {
    gap: 8,
    paddingVertical: 2,
  },
  filterChip: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  filterChipActive: {
    backgroundColor: colors.darkPillBg,
    borderColor: colors.darkPillBg,
  },
  filterChipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.textOnDark,
    fontFamily: fonts.bodySemiBold,
  },
  staleLinkChip: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder,
  },
  staleLinkChipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.warningDark,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 96,
  },
  separator: {
    height: 12,
  },
  orderCard: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: 14,
    gap: 10,
  },
  orderCardCompleted: {
    opacity: 0.9,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  osBadge: {
    backgroundColor: colors.darkPillBg,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  osBadgeCompleted: {
    backgroundColor: colors.textMuted,
  },
  osBadgeText: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    color: colors.textOnDark,
    letterSpacing: 0.3,
  },
  cardMetaText: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: colors.textMuted,
    flexShrink: 1,
  },
  cardTotalText: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: colors.bgCanvas,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  customerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  customerAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brandPrimarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  customerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  waIconBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  phoneText: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: colors.textMuted,
  },
  itemsContainer: {
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.md,
    padding: 8,
    gap: 6,
  },
  applianceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 44,
  },
  applianceRowPressed: {
    backgroundColor: colors.brandPrimarySoft,
  },
  applianceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  itemTagPill: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  itemTagText: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    color: colors.textSecondary,
  },
  applianceTitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textPrimary,
    flex: 1,
  },
  insightCard: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    borderRadius: radius.lg,
    padding: 14,
  },
  insightCardPressed: {
    opacity: 0.88,
  },
  insightLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  insightIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightCopy: {
    flex: 1,
    gap: 2,
  },
  insightTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  insightSubtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  insightBadge: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  insightBadgeText: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    color: colors.brandPrimary,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: 10,
  },
  emptyCard: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.lg,
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
  stateTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 16,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  stateSubtext: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  stateAction: {
    marginTop: 6,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: colors.brandPrimary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 6,
  },
  fabPressed: {
    backgroundColor: colors.brandPrimaryPressed,
  },
  fabText: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 15,
    color: colors.textOnDark,
  },
});
