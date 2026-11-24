import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  Minus,
  Plus,
} from 'lucide-react-native';
import { financeApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthProvider';
import { PayTransactionModal } from '@/components/finance/PayTransactionModal';
import { SuppliersModal } from '@/components/finance/SuppliersModal';
import { TransactionFormModal } from '@/components/finance/TransactionFormModal';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type {
  FinancialTransactionResponse,
  OrderPaymentMethod,
} from '@/types/api';

const MONTH_LABELS_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

const MONTH_LABELS_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const PAYMENT_BAR_CONFIG: { method: OrderPaymentMethod; color: string }[] = [
  { method: 'PIX', color: '#2563EB' },
  { method: 'CREDIT_CARD', color: '#475569' },
  { method: 'CASH', color: '#10B981' },
  { method: 'DEBIT_CARD', color: '#60A5FA' },
];

function getMonthBounds(year: number, monthIndex: number): { from: string; to: string } {
  const mm = String(monthIndex + 1).padStart(2, '0');
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const dd = String(lastDay).padStart(2, '0');
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${dd}`,
  };
}

function isPastDue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
  return dueDate.slice(0, 10) < todayIso;
}

function formatTxTimestamp(iso: string, locale: 'pt-BR' | 'en'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  if (sameDay) {
    return `${locale === 'pt-BR' ? 'Hoje' : 'Today'}, ${hh}:${mm}`;
  }
  const dd = String(date.getDate()).padStart(2, '0');
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mo}, ${hh}:${mm}`;
}

export default function FinanceDashboardScreen() {
  const { session, isOwner } = useAuth();
  const { locale, t, formatCurrency, formatShortDate } = useI18n();

  const initialDate = useMemo(() => new Date(), []);
  const [selectedYear, setSelectedYear] = useState(initialDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(initialDate.getMonth());
  const [showAllTransactions, setShowAllTransactions] = useState(false);

  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [suppliersModalOpen, setSuppliersModalOpen] = useState(false);
  const [payingTx, setPayingTx] = useState<FinancialTransactionResponse | null>(null);

  const { from, to } = useMemo(
    () => getMonthBounds(selectedYear, selectedMonth),
    [selectedYear, selectedMonth]
  );

  const summaryQuery = useQuery({
    queryKey: ['finance-summary', from, to],
    queryFn: () => financeApi.getSummary({ from, to }),
    enabled: isOwner,
  });

  const transactionsQuery = useQuery({
    queryKey: ['finance-transactions', from, to],
    queryFn: () => financeApi.listTransactions({ from, to, page: 0, size: 50 }),
    enabled: isOwner,
  });

  const pendingPayablesQuery = useQuery({
    queryKey: ['finance-pending'],
    queryFn: () =>
      financeApi.listTransactions({
        type: 'EXPENSE',
        status: 'PENDING',
        page: 0,
        size: 20,
      }),
    enabled: isOwner,
  });

  const shiftMonth = (delta: number) => {
    const next = new Date(selectedYear, selectedMonth + delta, 1);
    setSelectedYear(next.getFullYear());
    setSelectedMonth(next.getMonth());
  };

  const handleRefresh = () => {
    void Promise.all([
      summaryQuery.refetch(),
      transactionsQuery.refetch(),
      pendingPayablesQuery.refetch(),
    ]);
  };

  // Defense-in-depth RBAC guard (tab is already hidden for non-OWNER roles)
  if (!isOwner) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centerState}>
          <View style={styles.lockCircle}>
            <Lock size={24} color={colors.textMuted} />
          </View>
          <Text style={styles.stateTitle}>
            {locale === 'pt-BR' ? 'Acesso restrito ao dono' : 'Owner access only'}
          </Text>
          <Text style={styles.stateSubtext}>
            {locale === 'pt-BR'
              ? 'O módulo financeiro está disponível apenas para usuários com perfil DONO.'
              : 'The financial dashboard is restricted to owner accounts.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const monthLabel = `${
    (locale === 'pt-BR' ? MONTH_LABELS_PT : MONTH_LABELS_EN)[selectedMonth]
  } ${selectedYear}`;

  const summary = summaryQuery.data;
  const transactions = transactionsQuery.data?.content ?? [];
  const pendingPayables = pendingPayablesQuery.data?.content ?? [];
  const visibleTransactions = showAllTransactions ? transactions : transactions.slice(0, 6);

  const isLoading = summaryQuery.isLoading && !summary;
  const isRefreshing =
    summaryQuery.isRefetching ||
    transactionsQuery.isRefetching ||
    pendingPayablesQuery.isRefetching;

  const totalIncomePaid = summary?.totalIncomePaid ?? 0;
  const totalExpensePaid = summary?.totalExpensePaid ?? 0;
  const netBalance = summary?.netBalance ?? 0;
  const totalPendingPayables = summary?.totalPendingPayables ?? 0;
  const totalOverduePayables = summary?.totalOverduePayables ?? 0;

  const hasOverdue = totalOverduePayables > 0;
  const hasPending = totalPendingPayables > 0 || pendingPayables.length > 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Top App Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.shopName} numberOfLines={1}>
            {(session?.tenant.name ?? 'BenchOS').toUpperCase()}
          </Text>
          <Text style={styles.title}>{locale === 'pt-BR' ? 'Financeiro' : 'Finance'}</Text>
        </View>

        <View style={styles.headerRight}>
          <View style={styles.monthPill}>
            <Pressable
              onPress={() => shiftMonth(-1)}
              hitSlop={8}
              style={styles.monthArrowBtn}
              accessibilityLabel={locale === 'pt-BR' ? 'Mês anterior' : 'Previous month'}
            >
              <ChevronLeft size={14} color={colors.textMuted} strokeWidth={2.4} />
            </Pressable>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <Pressable
              onPress={() => shiftMonth(1)}
              hitSlop={8}
              style={styles.monthArrowBtn}
              accessibilityLabel={locale === 'pt-BR' ? 'Próximo mês' : 'Next month'}
            >
              <ChevronRight size={14} color={colors.textMuted} strokeWidth={2.4} />
            </Pressable>
          </View>

          <Pressable
            onPress={() => setSuppliersModalOpen(true)}
            style={({ pressed }) => [styles.iconSquareBtn, pressed && styles.iconSquareBtnPressed]}
            accessibilityLabel={locale === 'pt-BR' ? 'Fornecedores' : 'Suppliers'}
          >
            <Building2 size={17} color={colors.textPrimary} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
          <Text style={styles.stateSubtext}>
            {locale === 'pt-BR' ? 'Carregando resumo financeiro...' : 'Loading financial summary...'}
          </Text>
        </View>
      ) : summaryQuery.isError ? (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>
            {locale === 'pt-BR' ? 'Erro ao carregar o financeiro' : 'Failed to load finance data'}
          </Text>
          <Text style={styles.stateSubtext}>
            {summaryQuery.error instanceof Error
              ? summaryQuery.error.message
              : t.common.errorGeneric}
          </Text>
          <View style={styles.retryWrap}>
            <Button
              label={t.common.retry}
              variant="secondary"
              fullWidth={false}
              onPress={handleRefresh}
            />
          </View>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.brandPrimary}
              colors={[colors.brandPrimary]}
            />
          }
        >
          {/* Hero Balance Card */}
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <Text style={styles.heroOverline}>
                {locale === 'pt-BR' ? 'SALDO LÍQUIDO DO MÊS' : 'MONTHLY NET BALANCE'}
              </Text>
              <View style={styles.updatedBadge}>
                <Text style={styles.updatedBadgeText}>
                  {isRefreshing
                    ? locale === 'pt-BR'
                      ? 'Atualizando'
                      : 'Syncing'
                    : locale === 'pt-BR'
                      ? 'Atualizado'
                      : 'Updated'}
                </Text>
              </View>
            </View>

            <Text
              style={[
                styles.heroBalance,
                netBalance < 0 && styles.heroBalanceNegative,
              ]}
            >
              {netBalance < 0
                ? `- ${formatCurrency(Math.abs(netBalance))}`
                : formatCurrency(netBalance)}
            </Text>

            <View style={styles.pillsRow}>
              <View style={styles.incomePill}>
                <View style={styles.pillLabelRow}>
                  <ArrowUp size={13} color={colors.successDark} strokeWidth={2.4} />
                  <Text style={styles.incomePillLabel}>
                    {locale === 'pt-BR' ? 'Entradas' : 'Income'}
                  </Text>
                </View>
                <Text style={styles.incomePillValue} numberOfLines={1}>
                  + {formatCurrency(totalIncomePaid)}
                </Text>
              </View>

              <View style={styles.expensePill}>
                <View style={styles.pillLabelRow}>
                  <ArrowDown size={13} color={colors.dangerDark} strokeWidth={2.4} />
                  <Text style={styles.expensePillLabel}>
                    {locale === 'pt-BR' ? 'Despesas' : 'Expenses'}
                  </Text>
                </View>
                <Text style={styles.expensePillValue} numberOfLines={1}>
                  - {formatCurrency(totalExpensePaid)}
                </Text>
              </View>
            </View>
          </View>

          {/* Supplier Store Credit Alert Card ('Contas a Pagar / Fiado') */}
          {hasPending ? (
            <View style={[styles.fiadoCard, hasOverdue && styles.fiadoCardOverdue]}>
              <View style={[styles.fiadoHeader, !hasOverdue && styles.fiadoHeaderWarning]}>
                <View style={styles.fiadoHeaderLeft}>
                  <View
                    style={[
                      styles.fiadoIconCircle,
                      !hasOverdue && styles.fiadoIconCircleWarning,
                    ]}
                  >
                    <AlertTriangle
                      size={12}
                      color={hasOverdue ? colors.danger : colors.warning}
                      strokeWidth={2.4}
                    />
                  </View>
                  <Text
                    style={[
                      styles.fiadoTitle,
                      !hasOverdue && styles.fiadoTitleWarning,
                    ]}
                  >
                    {locale === 'pt-BR' ? 'Contas a Pagar (Fiado)' : 'Accounts Payable'}
                  </Text>
                </View>

                <View
                  style={[
                    styles.overduePill,
                    !hasOverdue && styles.onTrackPill,
                  ]}
                >
                  <Text
                    style={[
                      styles.overduePillText,
                      !hasOverdue && styles.onTrackPillText,
                    ]}
                  >
                    {hasOverdue
                      ? `${formatCurrency(totalOverduePayables)} ${
                          locale === 'pt-BR' ? 'vencido' : 'overdue'
                        }`
                      : locale === 'pt-BR'
                        ? 'A vencer'
                        : 'Upcoming'}
                  </Text>
                </View>
              </View>

              <View style={styles.fiadoBody}>
                <View style={styles.fiadoTotalRow}>
                  <Text style={styles.fiadoTotalLabel}>
                    {locale === 'pt-BR'
                      ? 'Total pendente em fornecedores:'
                      : 'Total pending payables:'}
                  </Text>
                  <Text style={styles.fiadoTotalValue}>
                    {formatCurrency(totalPendingPayables)}
                  </Text>
                </View>

                {pendingPayables.slice(0, 3).map((tx) => {
                  const overdue = isPastDue(tx.dueDate);
                  return (
                    <View key={tx.id} style={styles.payableRow}>
                      <View style={styles.payableInfo}>
                        <Text style={styles.payableTitle} numberOfLines={1}>
                          {tx.supplierName
                            ? `${tx.supplierName} · ${tx.description}`
                            : tx.description}
                        </Text>
                        <View style={styles.payableMetaRow}>
                          {tx.dueDate ? (
                            <View
                              style={[
                                styles.dueBadge,
                                overdue ? styles.dueBadgeOverdue : styles.dueBadgeUpcoming,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.dueBadgeText,
                                  overdue ? styles.dueBadgeTextOverdue : styles.dueBadgeTextUpcoming,
                                ]}
                              >
                                {overdue
                                  ? locale === 'pt-BR'
                                    ? `Venceu ${formatShortDate(tx.dueDate)}`
                                    : `Due ${formatShortDate(tx.dueDate)}`
                                  : locale === 'pt-BR'
                                    ? `Vence ${formatShortDate(tx.dueDate)}`
                                    : `Due ${formatShortDate(tx.dueDate)}`}
                              </Text>
                            </View>
                          ) : null}
                          <Text style={styles.payableAmount}>{formatCurrency(tx.amount)}</Text>
                        </View>
                      </View>

                      <Pressable
                        onPress={() => setPayingTx(tx)}
                        style={({ pressed }) => [
                          styles.settleBtn,
                          pressed && styles.settleBtnPressed,
                        ]}
                      >
                        <Text style={styles.settleBtnText}>
                          {locale === 'pt-BR' ? 'Quitar' : 'Pay'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={styles.clearPayablesCard}>
              <CheckCircle2 size={18} color={colors.success} />
              <Text style={styles.clearPayablesText}>
                {locale === 'pt-BR'
                  ? 'Nenhuma conta a pagar (fiado) pendente.'
                  : 'No pending supplier payables.'}
              </Text>
            </View>
          )}

          {/* Income by Payment Method Card */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>
                {locale === 'pt-BR'
                  ? 'Receitas por forma de pagamento'
                  : 'Income by payment method'}
              </Text>
              <Text style={styles.cardTitleMeta}>
                Total: {formatCurrency(totalIncomePaid)}
              </Text>
            </View>

            <View style={styles.barsList}>
              {PAYMENT_BAR_CONFIG.map(({ method, color }) => {
                const amount = Number(summary?.incomeByPaymentMethod?.[method] ?? 0);
                const pct =
                  totalIncomePaid > 0 ? Math.round((amount / totalIncomePaid) * 100) : 0;
                const widthPct =
                  totalIncomePaid > 0
                    ? Math.min(100, Math.max(amount > 0 ? 4 : 0, (amount / totalIncomePaid) * 100))
                    : 0;

                return (
                  <View key={method} style={styles.barItem}>
                    <View style={styles.barHeaderRow}>
                      <View style={styles.barLabelLeft}>
                        <View style={[styles.barDot, { backgroundColor: color }]} />
                        <Text style={styles.barMethodName}>{t.orderPaymentMethod[method]}</Text>
                      </View>
                      <View style={styles.barValueRight}>
                        <Text style={styles.barAmount}>{formatCurrency(amount)}</Text>
                        <Text style={styles.barPercent}> ({pct}%)</Text>
                      </View>
                    </View>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { width: `${widthPct}%`, backgroundColor: color },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Recent Transactions Section */}
          <View style={styles.recentSection}>
            <View style={styles.recentHeader}>
              <Text style={styles.recentOverline}>
                {locale === 'pt-BR' ? 'ÚLTIMAS MOVIMENTAÇÕES' : 'RECENT TRANSACTIONS'}
              </Text>
              {transactions.length > 6 ? (
                <Pressable onPress={() => setShowAllTransactions((prev) => !prev)} hitSlop={8}>
                  <Text style={styles.viewAllLink}>
                    {showAllTransactions
                      ? locale === 'pt-BR'
                        ? 'Mostrar menos'
                        : 'Show less'
                      : locale === 'pt-BR'
                        ? `Ver todas (${transactions.length})`
                        : `View all (${transactions.length})`}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.txCard}>
              {visibleTransactions.length === 0 ? (
                <View style={styles.emptyTxBox}>
                  <Text style={styles.emptyTxText}>
                    {locale === 'pt-BR'
                      ? 'Nenhuma movimentação registrada neste mês.'
                      : 'No transactions recorded for this month.'}
                  </Text>
                </View>
              ) : (
                visibleTransactions.map((tx, index) => {
                  const isIncome = tx.type === 'INCOME';
                  const isPending = tx.status === 'PENDING';
                  const overdue = isPending && isPastDue(tx.dueDate);

                  const subtitle = isPending
                    ? tx.dueDate
                      ? locale === 'pt-BR'
                        ? `${overdue ? 'Venceu' : 'Vence'} ${formatShortDate(tx.dueDate)} · Pendente`
                        : `Due ${formatShortDate(tx.dueDate)} · Pending`
                      : locale === 'pt-BR'
                        ? 'Pendente'
                        : 'Pending'
                    : `${formatTxTimestamp(tx.paidAt ?? tx.createdAt, locale)} · ${
                        t.paymentMethod[tx.paymentMethod]
                      }`;

                  return (
                    <Pressable
                      key={tx.id}
                      disabled={!isPending}
                      onPress={() => {
                        if (isPending) setPayingTx(tx);
                      }}
                      style={({ pressed }) => [
                        styles.txRow,
                        index > 0 && styles.txRowDivider,
                        pressed && isPending && styles.txRowPressed,
                      ]}
                    >
                      <View style={styles.txLeft}>
                        <View
                          style={[
                            styles.txIconBox,
                            isPending
                              ? styles.txIconBoxPending
                              : isIncome
                                ? styles.txIconBoxIncome
                                : styles.txIconBoxExpense,
                          ]}
                        >
                          {isPending ? (
                            <Clock size={14} color={colors.warning} strokeWidth={2.2} />
                          ) : isIncome ? (
                            <Plus size={14} color={colors.success} strokeWidth={2.5} />
                          ) : (
                            <Minus size={14} color={colors.danger} strokeWidth={2.5} />
                          )}
                        </View>

                        <View style={styles.txCopy}>
                          <Text style={styles.txTitle} numberOfLines={1}>
                            {tx.supplierName
                              ? `${tx.supplierName} · ${tx.description}`
                              : tx.description}
                          </Text>
                          <Text
                            style={[
                              styles.txSubtitle,
                              isPending &&
                                (overdue ? styles.txSubtitleOverdue : styles.txSubtitlePending),
                            ]}
                            numberOfLines={1}
                          >
                            {subtitle}
                          </Text>
                        </View>
                      </View>

                      <Text
                        style={[
                          styles.txAmount,
                          isPending
                            ? styles.txAmountPending
                            : isIncome
                              ? styles.txAmountIncome
                              : styles.txAmountExpense,
                        ]}
                      >
                        {isIncome ? '+' : '-'} {formatCurrency(tx.amount)}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>
          </View>
        </ScrollView>
      )}

      {/* Floating Action Button (+ Lançar) */}
      <Pressable
        onPress={() => setEntryModalOpen(true)}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        accessibilityRole="button"
        accessibilityLabel={locale === 'pt-BR' ? 'Novo lançamento' : 'New entry'}
      >
        <Plus size={17} color={colors.textOnDark} strokeWidth={2.5} />
        <Text style={styles.fabText}>{locale === 'pt-BR' ? 'Lançar' : 'Add'}</Text>
      </Pressable>

      {/* Modals */}
      <TransactionFormModal
        visible={entryModalOpen}
        onClose={() => setEntryModalOpen(false)}
      />

      <PayTransactionModal
        visible={payingTx !== null}
        transaction={payingTx}
        onClose={() => setPayingTx(null)}
      />

      <SuppliersModal
        visible={suppliersModalOpen}
        onClose={() => setSuppliersModalOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgCanvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bgCanvas,
    gap: 10,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  shopName: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.textMuted,
  },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: 21,
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 6,
    height: 36,
  },
  monthArrowBtn: {
    width: 24,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.textPrimary,
    minWidth: 66,
    textAlign: 'center',
  },
  iconSquareBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSquareBtnPressed: {
    backgroundColor: colors.bgSubtle,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 96,
    gap: 14,
  },
  heroCard: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: 16,
    gap: 8,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  heroOverline: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
  updatedBadge: {
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  updatedBadgeText: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: colors.successDark,
  },
  heroBalance: {
    fontFamily: fonts.monoBold,
    fontSize: 30,
    letterSpacing: -0.7,
    color: colors.textPrimary,
  },
  heroBalanceNegative: {
    color: colors.danger,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  incomePill: {
    flex: 1,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: radius.md,
    padding: 11,
    gap: 4,
  },
  expensePill: {
    flex: 1,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    padding: 11,
    gap: 4,
  },
  pillLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  incomePillLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.successDark,
  },
  incomePillValue: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    color: colors.successDark,
  },
  expensePillLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.dangerDark,
  },
  expensePillValue: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    color: colors.dangerDark,
  },
  fiadoCard: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  fiadoCardOverdue: {
    borderColor: colors.dangerBorder,
  },
  fiadoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: colors.dangerSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.dangerBorder,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  fiadoHeaderWarning: {
    backgroundColor: colors.warningSoft,
    borderBottomColor: colors.warningBorder,
  },
  fiadoHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  fiadoIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fiadoIconCircleWarning: {
    backgroundColor: '#FEF3C7',
  },
  fiadoTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.dangerDark,
  },
  fiadoTitleWarning: {
    color: colors.warningDark,
  },
  overduePill: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  onTrackPill: {
    backgroundColor: '#FEF3C7',
    borderColor: colors.warningBorder,
  },
  overduePillText: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    color: colors.danger,
  },
  onTrackPillText: {
    color: colors.warningDark,
  },
  fiadoBody: {
    padding: 14,
    gap: 10,
  },
  fiadoTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  fiadoTotalLabel: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textMuted,
  },
  fiadoTotalValue: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  payableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: 10,
  },
  payableInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  payableTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.textPrimary,
  },
  payableMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  dueBadge: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  dueBadgeOverdue: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  dueBadgeUpcoming: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder,
  },
  dueBadgeText: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
  },
  dueBadgeTextOverdue: {
    color: colors.danger,
  },
  dueBadgeTextUpcoming: {
    color: colors.warningDark,
  },
  payableAmount: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    color: colors.textPrimary,
  },
  settleBtn: {
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settleBtnPressed: {
    backgroundColor: colors.brandPrimaryPressed,
  },
  settleBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.textOnDark,
  },
  clearPayablesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  clearPayablesText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.successDark,
    flex: 1,
  },
  card: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: 16,
    gap: 14,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 13,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  cardTitleMeta: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: colors.textMuted,
  },
  barsList: {
    gap: 12,
  },
  barItem: {
    gap: 5,
  },
  barHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  barLabelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  barDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  barMethodName: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.textPrimary,
  },
  barValueRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  barAmount: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    color: colors.textPrimary,
  },
  barPercent: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: colors.textMuted,
  },
  barTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.bgSubtle,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  recentSection: {
    gap: 8,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  recentOverline: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
  viewAllLink: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.brandPrimary,
  },
  txCard: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  emptyTxBox: {
    padding: 20,
    alignItems: 'center',
  },
  emptyTxText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textMuted,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  txRowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  txRowPressed: {
    backgroundColor: colors.bgCanvas,
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  txIconBox: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txIconBoxIncome: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successBorder,
  },
  txIconBoxExpense: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  txIconBoxPending: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder,
  },
  txCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  txTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  txSubtitle: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: colors.textMuted,
  },
  txSubtitlePending: {
    color: colors.warning,
  },
  txSubtitleOverdue: {
    color: colors.danger,
  },
  txAmount: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
  },
  txAmountIncome: {
    color: colors.successDark,
  },
  txAmountExpense: {
    color: colors.danger,
  },
  txAmountPending: {
    color: colors.warning,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: 10,
  },
  lockCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.bgSubtle,
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
  retryWrap: {
    marginTop: 6,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 13,
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
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.textOnDark,
  },
});
