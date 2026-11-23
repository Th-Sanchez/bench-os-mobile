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
import { MessageCircle, Search, UserPlus, Users, X } from 'lucide-react-native';
import { customersApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthProvider';
import { CustomerFormModal } from '@/components/customers/CustomerFormModal';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { CustomerResponse } from '@/types/api';

type CustomerFilter = 'ALL' | 'WITH_NOTES' | 'RECENT';

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

export default function CustomersScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { t, locale, formatPhone } = useI18n();

  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState<CustomerFilter>('ALL');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerResponse | null>(null);

  const trimmedQuery = searchText.trim();

  const customersQuery = useQuery({
    queryKey: ['customers', trimmedQuery],
    queryFn: () => customersApi.search(trimmedQuery || undefined),
  });

  const allCustomers = customersQuery.data ?? [];

  const displayedCustomers = useMemo(() => {
    if (filter === 'WITH_NOTES') {
      return allCustomers.filter((c) => Boolean(c.notes && c.notes.trim().length > 0));
    }
    if (filter === 'RECENT') {
      return [...allCustomers].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
      );
    }
    return allCustomers;
  }, [allCustomers, filter]);

  const openCreateModal = () => {
    setEditingCustomer(null);
    setModalVisible(true);
  };

  const openEditModal = (customer: CustomerResponse) => {
    setEditingCustomer(customer);
    setModalVisible(true);
  };

  const handleOpenNewOrder = (customer: CustomerResponse) => {
    router.push({
      pathname: '/orders/new',
      params: {
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
      },
    });
  };

  const renderCustomer = ({ item }: { item: CustomerResponse }) => {
    const hasNotes = Boolean(item.notes && item.notes.trim().length > 0);

    return (
      <Pressable
        onPress={() => openEditModal(item)}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <View style={styles.cardLeft}>
          <View style={styles.initialsCircle}>
            <Text style={styles.initialsText}>{getInitials(item.name)}</Text>
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.customerName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.customerPhone}>{formatPhone(item.phone)}</Text>
            {hasNotes ? (
              <View style={styles.noteRow}>
                <View style={styles.noteDot} />
                <Text style={styles.noteText} numberOfLines={1}>
                  {item.notes}
                </Text>
              </View>
            ) : (
              <Text style={styles.noNotesText}>
                {locale === 'pt-BR' ? 'Sem observações' : 'No notes'}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => void Linking.openURL(buildWhatsappUrl(item.phone))}
            style={({ pressed }) => [styles.whatsappBtn, pressed && styles.btnPressed]}
            accessibilityLabel={`WhatsApp ${item.name}`}
          >
            <MessageCircle size={17} color={colors.successDark} strokeWidth={2.2} />
          </Pressable>
          <Pressable
            onPress={() => handleOpenNewOrder(item)}
            style={({ pressed }) => [styles.newOrderBtn, pressed && styles.newOrderBtnPressed]}
          >
            <Text style={styles.newOrderText}>+ OS</Text>
          </Pressable>
        </View>
      </Pressable>
    );
  };

  const shopName = session?.tenant.name ?? 'BenchOS';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <FlatList
        data={displayedCustomers}
        keyExtractor={(item) => item.id}
        renderItem={renderCustomer}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={customersQuery.isRefetching}
            onRefresh={() => {
              void customersQuery.refetch();
            }}
            tintColor={colors.brandPrimary}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {/* Top Title Row */}
            <View style={styles.titleRow}>
              <View>
                <Text style={styles.shopOverline}>{shopName.toUpperCase()}</Text>
                <Text style={styles.screenTitle}>{t.tabs.customers}</Text>
              </View>
              <View style={styles.countBadge}>
                <View style={styles.countDot} />
                <Text style={styles.countText}>
                  {allCustomers.length} {locale === 'pt-BR' ? 'ativos' : 'active'}
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
                    ? 'Buscar por telefone ou nome...'
                    : 'Search by phone or name...'
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

            {/* Quick Filter Pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {(
                [
                  { key: 'ALL', label: locale === 'pt-BR' ? 'Todos' : 'All' },
                  { key: 'RECENT', label: locale === 'pt-BR' ? 'Recentes' : 'Recent' },
                  { key: 'WITH_NOTES', label: locale === 'pt-BR' ? 'Com obs.' : 'With notes' },
                ] as const
              ).map((chip) => {
                const active = filter === chip.key;
                return (
                  <Pressable
                    key={chip.key}
                    onPress={() => setFilter(chip.key)}
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
        }
        ListEmptyComponent={
          customersQuery.isLoading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.brandPrimary} />
              <Text style={styles.centerSub}>{t.common.loading}</Text>
            </View>
          ) : customersQuery.isError ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorTitle}>
                {locale === 'pt-BR'
                  ? 'Não foi possível carregar os clientes'
                  : 'Unable to load customers'}
              </Text>
              <Button
                label={t.common.retry}
                variant="secondary"
                fullWidth={false}
                onPress={() => void customersQuery.refetch()}
              />
            </View>
          ) : (
            <View style={styles.centerBox}>
              <View style={styles.emptyIconCircle}>
                <Users size={24} color={colors.brandPrimary} />
              </View>
              <Text style={styles.emptyTitle}>
                {trimmedQuery
                  ? locale === 'pt-BR'
                    ? 'Nenhum cliente encontrado'
                    : 'No customers found'
                  : locale === 'pt-BR'
                    ? 'Nenhum cliente cadastrado ainda'
                    : 'No customers yet'}
              </Text>
              <Text style={styles.centerSub}>
                {locale === 'pt-BR'
                  ? 'Toque em "+ Novo Cliente" para cadastrar pelo telefone no balcão.'
                  : 'Tap "+ New Customer" to register a customer by phone.'}
              </Text>
            </View>
          )
        }
      />

      {/* Floating Action Button: + Novo Cliente */}
      <Pressable
        onPress={openCreateModal}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
      >
        <UserPlus size={17} color={colors.textOnDark} strokeWidth={2.3} />
        <Text style={styles.fabText}>
          {locale === 'pt-BR' ? '+ Novo Cliente' : '+ New Customer'}
        </Text>
      </Pressable>

      <CustomerFormModal
        visible={modalVisible}
        customer={editingCustomer}
        onClose={() => setModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgCanvas,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 96,
    gap: 10,
  },
  headerBlock: {
    gap: 12,
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  shopOverline: {
    fontFamily: fonts.monoBold,
    fontSize: 10.5,
    letterSpacing: 1,
    color: colors.textMuted,
  },
  screenTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 24,
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  countDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brandPrimary,
  },
  countText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.brandPrimaryPressed,
  },
  searchWrapper: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  filterRow: {
    gap: 8,
    paddingVertical: 2,
  },
  filterPill: {
    paddingHorizontal: 14,
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.xl,
    padding: 14,
  },
  cardPressed: {
    borderColor: colors.brandPrimary,
    backgroundColor: '#FCFDFF',
  },
  cardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  initialsCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandPrimarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.brandPrimary,
  },
  infoCol: {
    flex: 1,
    gap: 2,
  },
  customerName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14.5,
    color: colors.textPrimary,
  },
  customerPhone: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  noteDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  noteText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 11.5,
    color: colors.successDark,
    flex: 1,
  },
  noNotesText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  whatsappBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newOrderBtn: {
    height: 36,
    paddingHorizontal: 11,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newOrderBtnPressed: {
    backgroundColor: colors.brandPrimaryPressed,
  },
  btnPressed: {
    opacity: 0.75,
  },
  newOrderText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.textOnDark,
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
  centerSub: {
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
  fabText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14.5,
    color: colors.textOnDark,
  },
});
