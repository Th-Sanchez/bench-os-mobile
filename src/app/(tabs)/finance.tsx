import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
  Download,
  FileSpreadsheet,
  FileText,
  Lock,
  Minus,
  Plus,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react-native';
import { financeApi, ordersApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthProvider';
import { DailyCashClosingModal } from '@/components/finance/DailyCashClosingModal';
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
import {
  fetchAllMonthlyTransactions,
  shareMonthlyFinanceCsv,
  shareMonthlyFinancePdf,
} from '@/utils/financeExport';

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

function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function FinanceDashboardScreen() {
  const { session, isOwner } = useAuth();
  const { locale, t, formatCurrency, formatShortDate } = useI18n();
  const insets = useSafeAreaInsets();

  const initialDate = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => toLocalIsoDate(initialDate), [initialDate]);
  const deviceZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
    []
  );
  const [selectedYear, setSelectedYear] = useState(initialDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(initialDate.getMonth());
  const [showAllTransactions, setShowAllTransactions] = useState(false);

  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [suppliersModalOpen, setSuppliersModalOpen] = useState(false);
  const [dailyClosingModalOpen, setDailyClosingModalOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'csv' | null>(null);
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

  const dailyClosingQuery = useQuery({
    queryKey: ['finance-daily-closing', todayIso, deviceZone],
    queryFn: () => financeApi.getDailyClosing({ date: todayIso, zone: deviceZone }),
    enabled: isOwner,
  });

  const profitabilityQuery = useQuery({
    queryKey: ['orders-profitability', from, to, deviceZone],
    queryFn: () => ordersApi.getProfitability({ from, to, zone: deviceZone }),
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
      dailyClosingQuery.refetch(),
      profitabilityQuery.refetch(),
    ]);
  };

  const handleExportMonthly = async (format: 'pdf' | 'csv') => {
    if (!session?.tenant || exportingFormat !== null) return;
    setExportingFormat(format);
    try {
      const [activeSummary, allTransactions] = await Promise.all([
        summaryQuery.data
          ? Promise.resolve(summaryQuery.data)
          : financeApi.getSummary({ from, to }),
        fetchAllMonthlyTransactions(from, to),
      ]);

      const exportParams = {
        tenant: session.tenant,
        year: selectedYear,
        monthIndex: selectedMonth,
        summary: activeSummary,
        transactions: allTransactions,
        locale,
      };

      if (format === 'csv') {
        await shareMonthlyFinanceCsv(exportParams);
      } else {
        await shareMonthlyFinancePdf(exportParams);
      }
      setExportMenuOpen(false);
    } catch (err) {
      Alert.alert(
        locale === 'pt-BR' ? 'Erro ao exportar extrato' : 'Export failed',
        err instanceof Error ? err.message : t.common.errorGeneric
      );
    } finally {
      setExportingFormat(null);
    }
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
  const dailyClosing = dailyClosingQuery.data;
  const profitability = profitabilityQuery.data;
  const transactions = transactionsQuery.data?.content ?? [];
  const pendingPayables = pendingPayablesQuery.data?.content ?? [];
  const visibleTransactions = showAllTransactions ? transactions : transactions.slice(0, 6);

  const isLoading = summaryQuery.isLoading && !summary;
  const isRefreshing =
    summaryQuery.isRefetching ||
    transactionsQuery.isRefetching ||
    pendingPayablesQuery.isRefetching ||
    dailyClosingQuery.isRefetching ||
    profitabilityQuery.isRefetching;

  const totalIncomePaid = summary?.totalIncomePaid ?? 0;
  const totalExpensePaid = summary?.totalExpensePaid ?? 0;
  const netBalance = summary?.netBalance ?? 0;
  const totalPendingPayables = summary?.totalPendingPayables ?? 0;
  const totalOverduePayables = summary?.totalOverduePayables ?? 0;

  const todayNetCashFlow = dailyClosing?.netCashFlow ?? 0;
  const todayPixIn = Number(dailyClosing?.incomeByPaymentMethod?.PIX ?? 0);
  const todayCashDrawerNet =
    Number(dailyClosing?.incomeByPaymentMethod?.CASH ?? 0) -
    Number(dailyClosing?.expenseByPaymentMethod?.CASH ?? 0);
  const todayCardsIn =
    Number(dailyClosing?.incomeByPaymentMethod?.DEBIT_CARD ?? 0) +
    Number(dailyClosing?.incomeByPaymentMethod?.CREDIT_CARD ?? 0);
  const todayMovementsCount =
    (dailyClosing?.incomeCount ?? 0) + (dailyClosing?.expenseCount ?? 0);

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
            onPress={() => setExportMenuOpen(true)}
            disabled={exportingFormat !== null}
            style={({ pressed }) => [styles.iconSquareBtn, pressed && styles.iconSquareBtnPressed]}
            accessibilityLabel={locale === 'pt-BR' ? 'Exportar extrato' : 'Export statement'}
          >
            {exportingFormat !== null ? (
              <ActivityIndicator size="small" color={colors.brandPrimary} />
            ) : (
              <Download size={17} color={colors.textPrimary} strokeWidth={2} />
            )}
          </Pressable>

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

          {/* Daily Cash Closing Card ('Caixa de Hoje') */}
          <Pressable
            onPress={() => setDailyClosingModalOpen(true)}
            style={({ pressed }) => [styles.todayCard, pressed && styles.todayCardPressed]}
            accessibilityRole="button"
            accessibilityLabel={locale === 'pt-BR' ? 'Abrir fechamento de caixa de hoje' : 'Open daily cash closing'}
          >
            <View style={styles.todayHeaderRow}>
              <View style={styles.todayTitleGroup}>
                <View style={styles.todayIconBox}>
                  <Wallet size={15} color={colors.brandPrimary} strokeWidth={2.2} />
                </View>
                <View>
                  <Text style={styles.todayOverline}>
                    {locale === 'pt-BR' ? 'CAIXA DE HOJE' : "TODAY'S CASH"}
                  </Text>
                  <Text style={styles.todaySubmeta}>
                    {dailyClosingQuery.isLoading && !dailyClosing
                      ? locale === 'pt-BR'
                        ? 'Carregando movimentações...'
                        : 'Loading movements...'
                      : todayMovementsCount === 0
                        ? locale === 'pt-BR'
                          ? 'Nenhuma movimentação paga hoje'
                          : 'No paid movements today'
                        : locale === 'pt-BR'
                          ? `${todayMovementsCount} movimentaç${todayMovementsCount === 1 ? 'ão paga' : 'ões pagas'}`
                          : `${todayMovementsCount} paid movement${todayMovementsCount === 1 ? '' : 's'}`}
                  </Text>
                </View>
              </View>

              <View style={styles.todayCtaBadge}>
                <Text style={styles.todayCtaText}>
                  {locale === 'pt-BR' ? 'Fechar dia' : 'Close day'}
                </Text>
                <ChevronRight size={13} color={colors.brandPrimary} strokeWidth={2.4} />
              </View>
            </View>

            <View style={styles.todayBalanceRow}>
              <Text
                style={[
                  styles.todayBalanceValue,
                  todayNetCashFlow < 0 && styles.heroBalanceNegative,
                ]}
              >
                {todayNetCashFlow < 0
                  ? `- ${formatCurrency(Math.abs(todayNetCashFlow))}`
                  : formatCurrency(todayNetCashFlow)}
              </Text>
              <Text style={styles.todayBalanceCaption}>
                {locale === 'pt-BR' ? 'Saldo líquido do dia' : 'Net cash today'}
              </Text>
            </View>

            <View style={styles.todayBreakdownRow}>
              <View style={styles.todayMiniPill}>
                <Text style={styles.todayMiniLabel}>PIX</Text>
                <Text style={styles.todayMiniValue} numberOfLines={1}>
                  {formatCurrency(todayPixIn)}
                </Text>
              </View>
              <View style={styles.todayMiniPill}>
                <Text style={styles.todayMiniLabel}>
                  {locale === 'pt-BR' ? 'Gaveta' : 'Cash'}
                </Text>
                <Text
                  style={[
                    styles.todayMiniValue,
                    todayCashDrawerNet < 0 && styles.heroBalanceNegative,
                  ]}
                  numberOfLines={1}
                >
                  {todayCashDrawerNet < 0
                    ? `-${formatCurrency(Math.abs(todayCashDrawerNet))}`
                    : formatCurrency(todayCashDrawerNet)}
                </Text>
              </View>
              <View style={styles.todayMiniPill}>
                <Text style={styles.todayMiniLabel}>
                  {locale === 'pt-BR' ? 'Cartões' : 'Cards'}
                </Text>
                <Text style={styles.todayMiniValue} numberOfLines={1}>
                  {formatCurrency(todayCardsIn)}
                </Text>
              </View>
            </View>
          </Pressable>

          {/* Real Repair Margin Card ('Margem Real dos Reparos') */}
          {profitability && profitability.deliveredItemsCount > 0 ? (
            <View style={styles.todayCard}>
              <View style={styles.todayHeaderRow}>
                <View style={styles.todayTitleGroup}>
                  <View
                    style={[
                      styles.todayIconBox,
                      {
                        backgroundColor:
                          profitability.estimatedNetProfit < 0
                            ? colors.dangerSoft
                            : colors.successSoft,
                      },
                    ]}
                  >
                    <TrendingUp
                      size={15}
                      color={
                        profitability.estimatedNetProfit < 0
                          ? colors.dangerDark
                          : colors.successDark
                      }
                      strokeWidth={2.2}
                    />
                  </View>
                  <View>
                    <Text style={styles.todayOverline}>
                      {locale === 'pt-BR' ? 'MARGEM REAL DOS REPAROS' : 'REAL REPAIR MARGIN'}
                    </Text>
                    <Text style={styles.todaySubmeta}>
                      {locale === 'pt-BR'
                        ? `${profitability.deliveredItemsCount} entregue(s) em ${monthLabel}`
                        : `${profitability.deliveredItemsCount} delivered in ${monthLabel}`}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.updatedBadge,
                    profitability.estimatedNetProfit < 0 && {
                      backgroundColor: colors.dangerSoft,
                      borderColor: colors.dangerBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.updatedBadgeText,
                      profitability.estimatedNetProfit < 0 && { color: colors.dangerDark },
                    ]}
                  >
                    {Number(profitability.profitMarginPercent).toFixed(1)}%
                  </Text>
                </View>
              </View>

              <View style={styles.todayBalanceRow}>
                <Text
                  style={[
                    styles.todayBalanceValue,
                    profitability.estimatedNetProfit < 0 && styles.heroBalanceNegative,
                  ]}
                >
                  {profitability.estimatedNetProfit < 0
                    ? `- ${formatCurrency(Math.abs(profitability.estimatedNetProfit))}`
                    : formatCurrency(profitability.estimatedNetProfit)}
                </Text>
                <Text style={styles.todayBalanceCaption}>
                  {locale === 'pt-BR' ? 'Lucro líquido estimado' : 'Estimated net profit'}
                </Text>
              </View>

              <View style={styles.todayBreakdownRow}>
                <View style={styles.todayMiniPill}>
                  <Text style={styles.todayMiniLabel}>
                    {locale === 'pt-BR' ? 'Faturado OS' : 'Repairs rev.'}
                  </Text>
                  <Text style={styles.todayMiniValue} numberOfLines={1}>
                    {formatCurrency(profitability.totalRevenue)}
                  </Text>
                </View>
                <View style={styles.todayMiniPill}>
                  <Text style={styles.todayMiniLabel}>
                    {locale === 'pt-BR' ? 'Custo peças' : 'Parts cost'}
                  </Text>
                  <Text style={[styles.todayMiniValue, { color: colors.dangerDark }]} numberOfLines={1}>
                    - {formatCurrency(profitability.totalPartsCostActual)}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

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

      <DailyCashClosingModal
        visible={dailyClosingModalOpen}
        onClose={() => setDailyClosingModalOpen(false)}
      />

      {/* Export & Reports Bottom Sheet */}
      <Modal
        visible={exportMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (exportingFormat === null) setExportMenuOpen(false);
        }}
      >
        <View style={styles.exportBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (exportingFormat === null) setExportMenuOpen(false);
            }}
            accessibilityRole="button"
            accessibilityLabel={locale === 'pt-BR' ? 'Fechar' : 'Close'}
          />
          <View
            style={[
              styles.exportSheet,
              { paddingBottom: Math.max(insets.bottom + spacing.md, spacing.xxl) },
            ]}
          >
            <View style={styles.exportHeader}>
              <View>
                <Text style={styles.exportTitle}>
                  {locale === 'pt-BR' ? 'Relatórios & Exportação' : 'Reports & Export'}
                </Text>
                <Text style={styles.exportSubtitle}>
                  {locale === 'pt-BR'
                    ? `Período selecionado: ${monthLabel}`
                    : `Selected period: ${monthLabel}`}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  if (exportingFormat === null) setExportMenuOpen(false);
                }}
                hitSlop={10}
              >
                <X size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <Pressable
              disabled={exportingFormat !== null}
              onPress={() => {
                void handleExportMonthly('pdf');
              }}
              style={({ pressed }) => [
                styles.exportOption,
                pressed && styles.exportOptionPressed,
              ]}
            >
              <View style={[styles.exportIconCircle, styles.exportIconPdf]}>
                {exportingFormat === 'pdf' ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <FileText size={18} color={colors.danger} strokeWidth={2.1} />
                )}
              </View>
              <View style={styles.exportOptionCopy}>
                <Text style={styles.exportOptionTitle}>
                  {locale === 'pt-BR' ? 'Extrato Mensal (PDF)' : 'Monthly Statement (PDF)'}
                </Text>
                <Text style={styles.exportOptionDesc}>
                  {locale === 'pt-BR'
                    ? 'Documento A4 pronto para imprimir, WhatsApp ou enviar ao contador'
                    : 'A4 statement ready for printing, WhatsApp or your accountant'}
                </Text>
              </View>
            </Pressable>

            <Pressable
              disabled={exportingFormat !== null}
              onPress={() => {
                void handleExportMonthly('csv');
              }}
              style={({ pressed }) => [
                styles.exportOption,
                pressed && styles.exportOptionPressed,
              ]}
            >
              <View style={[styles.exportIconCircle, styles.exportIconCsv]}>
                {exportingFormat === 'csv' ? (
                  <ActivityIndicator size="small" color={colors.successDark} />
                ) : (
                  <FileSpreadsheet size={18} color={colors.successDark} strokeWidth={2.1} />
                )}
              </View>
              <View style={styles.exportOptionCopy}>
                <Text style={styles.exportOptionTitle}>
                  {locale === 'pt-BR' ? 'Planilha Mensal (CSV)' : 'Monthly Spreadsheet (CSV)'}
                </Text>
                <Text style={styles.exportOptionDesc}>
                  {locale === 'pt-BR'
                    ? 'Compatível com Excel (UTF-8 / ponto e vírgula) para controle MEI'
                    : 'Excel-compatible CSV spreadsheet with all month transactions'}
                </Text>
              </View>
            </Pressable>

            <Pressable
              disabled={exportingFormat !== null}
              onPress={() => {
                setExportMenuOpen(false);
                setDailyClosingModalOpen(true);
              }}
              style={({ pressed }) => [
                styles.exportOption,
                pressed && styles.exportOptionPressed,
              ]}
            >
              <View style={[styles.exportIconCircle, styles.exportIconDaily]}>
                <Wallet size={18} color={colors.brandPrimary} strokeWidth={2.1} />
              </View>
              <View style={styles.exportOptionCopy}>
                <Text style={styles.exportOptionTitle}>
                  {locale === 'pt-BR' ? 'Fechamento de Caixa do Dia' : 'Daily Cash Closing'}
                </Text>
                <Text style={styles.exportOptionDesc}>
                  {locale === 'pt-BR'
                    ? 'Conferir entradas/saídas por PIX, gaveta em dinheiro e cartões'
                    : 'Reconcile daily inflows/outflows by PIX, cash drawer and cards'}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  todayCard: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: 14,
    gap: 10,
  },
  todayCardPressed: {
    backgroundColor: colors.bgCanvas,
  },
  todayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  todayTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  todayIconBox: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayOverline: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.textPrimary,
  },
  todaySubmeta: {
    fontFamily: fonts.bodyRegular,
    fontSize: 11,
    color: colors.textMuted,
  },
  todayCtaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.brandPrimarySoft,
    borderRadius: radius.md,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  todayCtaText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: colors.brandPrimary,
  },
  todayBalanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  todayBalanceValue: {
    fontFamily: fonts.monoBold,
    fontSize: 21,
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  todayBalanceCaption: {
    fontFamily: fonts.bodyRegular,
    fontSize: 11,
    color: colors.textMuted,
  },
  todayBreakdownRow: {
    flexDirection: 'row',
    gap: 8,
  },
  todayMiniPill: {
    flex: 1,
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 9,
    paddingVertical: 7,
    gap: 2,
  },
  todayMiniLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: colors.textMuted,
  },
  todayMiniValue: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    color: colors.textPrimary,
  },
  exportBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  exportSheet: {
    backgroundColor: colors.bgSurface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: 10,
  },
  exportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  exportTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  exportSubtitle: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  exportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: 12,
  },
  exportOptionPressed: {
    backgroundColor: colors.bgSubtle,
  },
  exportIconCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportIconPdf: {
    backgroundColor: colors.dangerSoft,
  },
  exportIconCsv: {
    backgroundColor: colors.successSoft,
  },
  exportIconDaily: {
    backgroundColor: colors.brandPrimarySoft,
  },
  exportOptionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  exportOptionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  exportOptionDesc: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
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
