import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  MessageCircle,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  StickyNote,
  Wrench,
} from 'lucide-react-native';
import { customersApi, ordersApi } from '@/api/endpoints';
import { CustomerFormModal } from '@/components/customers/CustomerFormModal';
import { WarrantyReturnModal } from '@/components/orders/WarrantyReturnModal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TagBadge } from '@/components/ui/TagBadge';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { ServiceOrderItemResponse, ServiceOrderResponse } from '@/types/api';
import { maskCpfCnpj } from '@/utils/masks';
import {
  computeWarrantyInfo,
  formatFullDate,
  type WarrantyInfo,
} from '@/utils/warrantyReceiptPdf';

type HistoryFilter = 'ALL' | 'OPEN' | 'DELIVERED' | 'WARRANTY';

interface ActiveWarrantyEntry {
  order: ServiceOrderResponse;
  item: ServiceOrderItemResponse;
  warranty: WarrantyInfo;
}

function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'CL'
  );
}

function buildWhatsappUrl(normalizedPhone: string): string {
  const digits = normalizedPhone.replace(/\D/g, '');
  const full =
    (digits.length === 10 || digits.length === 11) && !digits.startsWith('55')
      ? `55${digits}`
      : digits;
  return `https://wa.me/${full}`;
}

export default function CustomerDetailScreen() {
  const router = useRouter();
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const { t, locale, formatCurrency, formatPhone, formatShortDate } = useI18n();

  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('ALL');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [returnTarget, setReturnTarget] = useState<{
    orderId: string;
    item: ServiceOrderItemResponse;
  } | null>(null);

  const customerQuery = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => customersApi.get(customerId),
    enabled: Boolean(customerId),
  });

  const ordersQuery = useQuery({
    queryKey: ['customer-orders', customerId],
    queryFn: () => ordersApi.list({ customerId, page: 0, size: 100 }),
    enabled: Boolean(customerId),
  });

  const customer = customerQuery.data;
  const orders = useMemo(() => ordersQuery.data?.content ?? [], [ordersQuery.data]);

  const stats = useMemo(() => {
    let totalSpent = 0;
    let totalAppliances = 0;
    const activeWarranties: ActiveWarrantyEntry[] = [];

    for (const order of orders) {
      for (const item of order.items) {
        totalAppliances += 1;
        if (item.status === 'DELIVERED') {
          totalSpent += Number(item.totalPrice) || 0;
          const warranty = computeWarrantyInfo(item);
          if (warranty.hasWarranty && warranty.isActive) {
            activeWarranties.push({ order, item, warranty });
          }
        }
      }
    }

    activeWarranties.sort((a, b) => a.warranty.daysRemaining - b.warranty.daysRemaining);

    return {
      totalSpent,
      totalOrders: orders.length,
      totalAppliances,
      activeWarranties,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (historyFilter === 'ALL') return orders;
    return orders.filter((order) => {
      if (historyFilter === 'OPEN') {
        return order.items.some(
          (i) => i.status !== 'DELIVERED' && i.status !== 'CANCELLED' && i.status !== 'DISCARDED'
        );
      }
      if (historyFilter === 'DELIVERED') {
        return order.items.some((i) => i.status === 'DELIVERED');
      }
      return order.items.some((i) => {
        if (i.warrantyReturn) return true;
        if (i.status === 'DELIVERED') {
          const w = computeWarrantyInfo(i);
          return w.hasWarranty && w.isActive;
        }
        return false;
      });
    });
  }, [orders, historyFilter]);

  const handleOpenNewOrder = () => {
    if (!customer) return;
    router.push({
      pathname: '/orders/new',
      params: {
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
      },
    });
  };

  if (customerQuery.isLoading) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </SafeAreaView>
    );
  }

  if (customerQuery.isError || !customer) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <Text style={styles.errorTitle}>
          {locale === 'pt-BR' ? 'Cliente não encontrado' : 'Customer not found'}
        </Text>
        <Button label={t.common.back} variant="secondary" fullWidth={false} onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.navIconBtn} hitSlop={8}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          {locale === 'pt-BR' ? 'Ficha do Cliente' : 'Customer Profile'}
        </Text>
        <Pressable onPress={() => setEditModalVisible(true)} style={styles.editTopBtn} hitSlop={8}>
          <Pencil size={15} color={colors.brandPrimary} />
          <Text style={styles.editTopText}>{t.common.edit}</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={customerQuery.isRefetching || ordersQuery.isRefetching}
            onRefresh={() => {
              void customerQuery.refetch();
              void ordersQuery.refetch();
            }}
            tintColor={colors.brandPrimary}
          />
        }
      >
        {/* Profile Header Card */}
        <Card style={styles.profileCard}>
          <View style={styles.profileTopRow}>
            <View style={styles.initialsCircle}>
              <Text style={styles.initialsText}>{getInitials(customer.name)}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.customerName}>{customer.name}</Text>
              <Text style={styles.customerPhone}>{formatPhone(customer.phone)}</Text>
              <Text style={styles.memberSince}>
                {locale === 'pt-BR' ? 'Cliente desde ' : 'Customer since '}
                {formatShortDate(customer.createdAt)}
              </Text>
            </View>
          </View>

          {customer.document || customer.notes ? (
            <View style={styles.metaDetailsBox}>
              {customer.document ? (
                <View style={styles.metaDetailRow}>
                  <FileText size={13} color={colors.textMuted} />
                  <Text style={styles.metaDetailMono}>{maskCpfCnpj(customer.document)}</Text>
                </View>
              ) : null}
              {customer.notes ? (
                <View style={styles.metaDetailRow}>
                  <StickyNote size={13} color={colors.textMuted} />
                  <Text style={styles.metaDetailText}>{customer.notes}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Quick Actions */}
          <View style={styles.quickActionsRow}>
            <Button
              label="WhatsApp"
              variant="whatsapp"
              icon={<MessageCircle size={16} color={colors.successDark} />}
              onPress={() => void Linking.openURL(buildWhatsappUrl(customer.phone))}
              style={styles.halfBtn}
            />
            <Button
              label={locale === 'pt-BR' ? 'Nova OS' : 'New Order'}
              icon={<Plus size={16} color={colors.textOnDark} />}
              onPress={handleOpenNewOrder}
              style={styles.halfBtn}
            />
          </View>
        </Card>

        {/* KPI Row */}
        <View style={styles.kpiGrid}>
          <Card style={styles.kpiTile}>
            <Text style={styles.kpiLabel}>
              {locale === 'pt-BR' ? 'TOTAL GASTO' : 'TOTAL SPENT'}
            </Text>
            <Text style={styles.kpiValueMono} numberOfLines={1} adjustsFontSizeToFit>
              {formatCurrency(stats.totalSpent)}
            </Text>
          </Card>

          <Card style={styles.kpiTile}>
            <Text style={styles.kpiLabel}>
              {locale === 'pt-BR' ? 'ATENDIMENTOS' : 'SERVICED'}
            </Text>
            <Text style={styles.kpiValueMono}>
              {stats.totalOrders} OS · {stats.totalAppliances}{' '}
              {stats.totalAppliances === 1
                ? locale === 'pt-BR'
                  ? 'ap.'
                  : 'item'
                : locale === 'pt-BR'
                  ? 'aps.'
                  : 'items'}
            </Text>
          </Card>

          <Card
            accentBorderColor={
              stats.activeWarranties.length > 0 ? colors.successBorder : colors.borderSubtle
            }
            style={styles.kpiTile}
          >
            <Text style={styles.kpiLabel}>
              {locale === 'pt-BR' ? 'GARANTIAS' : 'WARRANTIES'}
            </Text>
            <Text
              style={[
                styles.kpiValueMono,
                stats.activeWarranties.length > 0 && styles.kpiSuccess,
              ]}
            >
              {stats.activeWarranties.length}{' '}
              {locale === 'pt-BR'
                ? stats.activeWarranties.length === 1
                  ? 'ativa'
                  : 'ativas'
                : 'active'}
            </Text>
          </Card>
        </View>

        {/* Active Warranties Highlight */}
        {stats.activeWarranties.length > 0 ? (
          <Card accentBorderColor={colors.successBorder} style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <ShieldCheck size={17} color={colors.successDark} />
              <Text style={styles.sectionTitle}>
                {locale === 'pt-BR' ? 'Garantias Vigentes' : 'Active Warranties'}
              </Text>
            </View>

            <View style={styles.warrantyList}>
              {stats.activeWarranties.map(({ order, item, warranty }) => {
                const title = [item.applianceType, item.brand, item.model].filter(Boolean).join(' ');
                return (
                  <View key={item.id} style={styles.warrantyRow}>
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: '/orders/[orderId]/items/[itemId]',
                          params: { orderId: order.id, itemId: item.id },
                        })
                      }
                      style={styles.warrantyRowLeft}
                    >
                      <View style={styles.warrantyTagLine}>
                        <TagBadge label={`#${item.tag}`} variant="dark" />
                        <View style={styles.warrantyActivePill}>
                          <Text style={styles.warrantyActivePillText}>
                            {locale === 'pt-BR'
                              ? `${warranty.daysRemaining} de ${warranty.warrantyDays}d`
                              : `${warranty.daysRemaining}/${warranty.warrantyDays}d`}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.warrantyAppliance} numberOfLines={1}>
                        {title}
                      </Text>
                      {warranty.expiryDate ? (
                        <Text style={styles.warrantyExpirySub}>
                          {locale === 'pt-BR' ? 'Válida até ' : 'Valid until '}
                          {formatFullDate(warranty.expiryDate, locale)}
                        </Text>
                      ) : null}
                    </Pressable>

                    <Pressable
                      onPress={() => setReturnTarget({ orderId: order.id, item })}
                      style={({ pressed }) => [styles.returnChipBtn, pressed && styles.pressed]}
                    >
                      <RotateCcw size={13} color={colors.brandPrimary} />
                      <Text style={styles.returnChipText}>
                        {locale === 'pt-BR' ? 'Retorno' : 'Return'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </Card>
        ) : null}

        {/* Service Order History */}
        <View style={styles.historyHeader}>
          <View style={styles.sectionTitleRow}>
            <ClipboardList size={17} color={colors.textPrimary} />
            <Text style={styles.sectionTitle}>
              {locale === 'pt-BR' ? 'Histórico de Ordens de Serviço' : 'Service Order History'}
            </Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {(
              [
                { key: 'ALL', label: locale === 'pt-BR' ? 'Todas' : 'All' },
                { key: 'OPEN', label: locale === 'pt-BR' ? 'Em aberto' : 'Open' },
                { key: 'DELIVERED', label: locale === 'pt-BR' ? 'Entregues' : 'Delivered' },
                { key: 'WARRANTY', label: locale === 'pt-BR' ? 'Garantias' : 'Warranties' },
              ] as const
            ).map((chip) => {
              const active = historyFilter === chip.key;
              return (
                <Pressable
                  key={chip.key}
                  onPress={() => setHistoryFilter(chip.key)}
                  style={[styles.filterPill, active && styles.filterPillActive]}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {chip.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {ordersQuery.isLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="small" color={colors.brandPrimary} />
          </View>
        ) : filteredOrders.length === 0 ? (
          <Card style={styles.emptyHistoryCard}>
            <Wrench size={22} color={colors.textMuted} />
            <Text style={styles.emptyHistoryTitle}>
              {locale === 'pt-BR' ? 'Nenhuma OS encontrada' : 'No service orders found'}
            </Text>
            <Text style={styles.emptyHistorySub}>
              {historyFilter === 'ALL'
                ? locale === 'pt-BR'
                  ? 'Este cliente ainda não possui ordens de serviço registradas.'
                  : 'This customer has no service orders yet.'
                : locale === 'pt-BR'
                  ? 'Nenhuma ordem corresponde ao filtro selecionado.'
                  : 'No orders match the selected filter.'}
            </Text>
          </Card>
        ) : (
          <View style={styles.ordersList}>
            {filteredOrders.map((order) => {
              const orderTotal = order.items
                .filter((i) => i.status !== 'CANCELLED' && i.status !== 'REJECTED')
                .reduce((acc, i) => acc + (Number(i.totalPrice) || 0), 0);

              return (
                <Card key={order.id} padded={false} style={styles.orderCard}>
                  <View style={styles.orderCardHeader}>
                    <View style={styles.orderHeaderLeft}>
                      <Text style={styles.orderNumberMono}>OS #{order.orderNumber}</Text>
                      <Text style={styles.orderDateSub}>{formatShortDate(order.createdAt)}</Text>
                    </View>
                    {orderTotal > 0 ? (
                      <Text style={styles.orderTotalMono}>{formatCurrency(orderTotal)}</Text>
                    ) : null}
                  </View>

                  <View style={styles.orderItemsList}>
                    {order.items.map((item, idx) => {
                      const title = [item.applianceType, item.brand, item.model]
                        .filter(Boolean)
                        .join(' ');
                      const warranty = item.status === 'DELIVERED' ? computeWarrantyInfo(item) : null;

                      return (
                        <Pressable
                          key={item.id}
                          onPress={() =>
                            router.push({
                              pathname: '/orders/[orderId]/items/[itemId]',
                              params: { orderId: order.id, itemId: item.id },
                            })
                          }
                          style={({ pressed }) => [
                            styles.orderItemRow,
                            idx > 0 && styles.orderItemRowBorder,
                            pressed && styles.orderItemRowPressed,
                          ]}
                        >
                          <View style={styles.orderItemBody}>
                            <View style={styles.orderItemTopLine}>
                              <TagBadge label={`#${item.tag}`} variant="subtle" />
                              {item.warrantyReturn ? (
                                <View style={styles.warrantyReturnPill}>
                                  <RotateCcw size={10} color={colors.warningDark} />
                                  <Text style={styles.warrantyReturnPillText}>
                                    {item.parentItemTag
                                      ? locale === 'pt-BR'
                                        ? `Garantia #${item.parentItemTag}`
                                        : `Warranty #${item.parentItemTag}`
                                      : locale === 'pt-BR'
                                        ? 'Retorno Garantia'
                                        : 'Warranty Return'}
                                  </Text>
                                </View>
                              ) : null}
                              <StatusBadge status={item.status} />
                            </View>

                            <Text style={styles.orderItemTitle} numberOfLines={1}>
                              {title}
                            </Text>
                            <Text style={styles.orderItemIssue} numberOfLines={1}>
                              {item.technicalDiagnosis || item.reportedIssue}
                            </Text>

                            {warranty && warranty.hasWarranty ? (
                              <Text
                                style={[
                                  styles.itemWarrantyHint,
                                  warranty.isActive
                                    ? styles.itemWarrantyHintActive
                                    : styles.itemWarrantyHintExpired,
                                ]}
                              >
                                {warranty.isActive
                                  ? locale === 'pt-BR'
                                    ? `Garantia ativa: ${warranty.daysRemaining} de ${warranty.warrantyDays} dias restantes`
                                    : `Active warranty: ${warranty.daysRemaining}/${warranty.warrantyDays} days left`
                                  : locale === 'pt-BR'
                                    ? 'Garantia expirada'
                                    : 'Warranty expired'}
                              </Text>
                            ) : null}
                          </View>

                          <ChevronRight size={16} color={colors.textMuted} />
                        </Pressable>
                      );
                    })}
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>

      <CustomerFormModal
        visible={editModalVisible}
        customer={customer}
        onClose={() => setEditModalVisible(false)}
        onSaved={() => {
          void customerQuery.refetch();
        }}
      />

      <WarrantyReturnModal
        visible={Boolean(returnTarget)}
        orderId={returnTarget?.orderId ?? ''}
        item={returnTarget?.item ?? null}
        onClose={() => setReturnTarget(null)}
        onCreated={(createdOrder) => {
          const createdItem = createdOrder.items[0];
          if (createdItem) {
            router.push({
              pathname: '/orders/[orderId]/items/[itemId]',
              params: { orderId: createdOrder.id, itemId: createdItem.id },
            });
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgCanvas,
  },
  centerScreen: {
    flex: 1,
    backgroundColor: colors.bgCanvas,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  errorTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  topBar: {
    height: 54,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  navIconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.headlineBold,
    fontSize: 16.5,
    color: colors.textPrimary,
  },
  editTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimarySoft,
  },
  editTopText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: colors.brandPrimary,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 40,
    gap: 14,
  },
  profileCard: {
    gap: 14,
  },
  profileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  initialsCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontFamily: fonts.headlineBold,
    fontSize: 18,
    color: colors.brandPrimary,
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  customerName: {
    fontFamily: fonts.headlineBold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  customerPhone: {
    fontFamily: fonts.monoMedium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  memberSince: {
    fontFamily: fonts.bodyRegular,
    fontSize: 11.5,
    color: colors.textMuted,
  },
  metaDetailsBox: {
    backgroundColor: colors.bgCanvas,
    borderRadius: radius.md,
    padding: 10,
    gap: 6,
  },
  metaDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  metaDetailMono: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  metaDetailText: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  halfBtn: {
    flex: 1,
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  kpiTile: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 4,
  },
  kpiLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 9.5,
    letterSpacing: 0.6,
    color: colors.textMuted,
  },
  kpiValueMono: {
    fontFamily: fonts.monoBold,
    fontSize: 13.5,
    color: colors.textPrimary,
  },
  kpiSuccess: {
    color: colors.successDark,
  },
  sectionCard: {
    gap: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  warrantyList: {
    gap: 10,
  },
  warrantyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: 12,
  },
  warrantyRowLeft: {
    flex: 1,
    gap: 4,
  },
  warrantyTagLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  warrantyActivePill: {
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  warrantyActivePillText: {
    fontFamily: fonts.monoBold,
    fontSize: 10.5,
    color: colors.successDark,
  },
  warrantyAppliance: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13.5,
    color: colors.textPrimary,
  },
  warrantyExpirySub: {
    fontFamily: fonts.bodyRegular,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  returnChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  returnChipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.brandPrimary,
  },
  pressed: {
    opacity: 0.75,
  },
  historyHeader: {
    gap: 10,
    marginTop: 4,
  },
  filterRow: {
    gap: 8,
    paddingVertical: 2,
  },
  filterPill: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: radius.md,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  filterPillActive: {
    backgroundColor: colors.darkPillBg,
    borderColor: colors.darkPillBg,
  },
  filterText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  filterTextActive: {
    fontFamily: fonts.bodySemiBold,
    color: colors.textOnDark,
  },
  centerBox: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  emptyHistoryCard: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 6,
  },
  emptyHistoryTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 14.5,
    color: colors.textPrimary,
  },
  emptyHistorySub: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12.5,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  ordersList: {
    gap: 10,
  },
  orderCard: {
    overflow: 'hidden',
  },
  orderCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.bgSubtle,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  orderHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderNumberMono: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  orderDateSub: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textMuted,
  },
  orderTotalMono: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  orderItemsList: {
    backgroundColor: colors.bgSurface,
  },
  orderItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  orderItemRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  orderItemRowPressed: {
    backgroundColor: '#F8FAFC',
  },
  orderItemBody: {
    flex: 1,
    gap: 4,
  },
  orderItemTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  warrantyReturnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  warrantyReturnPillText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10.5,
    color: colors.warningDark,
  },
  orderItemTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  orderItemIssue: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  itemWarrantyHint: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11.5,
    marginTop: 2,
  },
  itemWarrantyHintActive: {
    color: colors.successDark,
  },
  itemWarrantyHintExpired: {
    color: colors.danger,
  },
});
