import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Banknote,
  ChevronLeft,
  ChevronRight,
  FileText,
  Wallet,
  X,
} from 'lucide-react-native';
import { financeApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { OrderPaymentMethod } from '@/types/api';
import { shareDailyCashClosingPdf } from '@/utils/financeExport';
import { formatTransactionDescription } from '@/utils/transactionDescription';

const METHODS: OrderPaymentMethod[] = ['PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD'];

function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const next = new Date(y, m - 1, d + deltaDays);
  return toLocalIsoDate(next);
}

function formatDateHeading(isoDate: string, todayIso: string, locale: 'pt-BR' | 'en'): string {
  const [, m, d] = isoDate.split('-');
  const short = locale === 'en' ? `${m}/${d}` : `${d}/${m}`;
  if (isoDate === todayIso) {
    return `${locale === 'pt-BR' ? 'Hoje' : 'Today'} · ${short}`;
  }
  if (isoDate === shiftIsoDate(todayIso, -1)) {
    return `${locale === 'pt-BR' ? 'Ontem' : 'Yesterday'} · ${short}`;
  }
  return locale === 'en' ? isoDate : `${d}/${m}/${isoDate.slice(0, 4)}`;
}

function formatHour(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface DailyCashClosingModalProps {
  visible: boolean;
  onClose: () => void;
}

export function DailyCashClosingModal({ visible, onClose }: DailyCashClosingModalProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {visible ? <DailyCashClosingBody onClose={onClose} /> : null}
    </Modal>
  );
}

function DailyCashClosingBody({ onClose }: { onClose: () => void }) {
  const { session } = useAuth();
  const { locale, t, formatCurrency } = useI18n();
  const insets = useSafeAreaInsets();

  const todayIso = useMemo(() => toLocalIsoDate(new Date()), []);
  const deviceZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
    []
  );
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [exportingPdf, setExportingPdf] = useState(false);

  const closingQuery = useQuery({
    queryKey: ['finance-daily-closing', selectedDate, deviceZone],
    queryFn: () => financeApi.getDailyClosing({ date: selectedDate, zone: deviceZone }),
  });

  const closing = closingQuery.data;
  const canGoNext = selectedDate < todayIso;

  const cashIn = Number(closing?.incomeByPaymentMethod.CASH ?? 0);
  const cashOut = Number(closing?.expenseByPaymentMethod.CASH ?? 0);
  const cashDrawerNet = cashIn - cashOut;

  const handleExportPdf = async () => {
    if (!closing || !session?.tenant) return;
    setExportingPdf(true);
    try {
      await shareDailyCashClosingPdf({
        tenant: session.tenant,
        closing,
        locale,
      });
    } catch (err) {
      Alert.alert(
        locale === 'pt-BR' ? 'Erro ao gerar PDF' : 'Could not export PDF',
        err instanceof Error ? err.message : t.common.errorGeneric
      );
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View
        style={[
          styles.header,
          Platform.OS === 'android' && {
            paddingTop: insets.top,
            height: 58 + insets.top,
          },
        ]}
      >
        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
          <X size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {locale === 'pt-BR' ? 'Fechamento de Caixa' : 'Daily Cash Closing'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Date Switcher */}
      <View style={styles.dateBar}>
        <Pressable
          onPress={() => setSelectedDate((prev) => shiftIsoDate(prev, -1))}
          style={styles.dateArrowBtn}
          hitSlop={8}
        >
          <ChevronLeft size={18} color={colors.textPrimary} />
        </Pressable>

        <Text style={styles.dateBarLabel}>
          {formatDateHeading(selectedDate, todayIso, locale)}
        </Text>

        <Pressable
          onPress={() => {
            if (canGoNext) {
              setSelectedDate((prev) => shiftIsoDate(prev, 1));
            }
          }}
          disabled={!canGoNext}
          style={[styles.dateArrowBtn, !canGoNext && styles.dateArrowDisabled]}
          hitSlop={8}
        >
          <ChevronRight size={18} color={colors.textPrimary} />
        </Pressable>
      </View>

      {closingQuery.isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
        </View>
      ) : closingQuery.isError || !closing ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorTitle}>
            {locale === 'pt-BR'
              ? 'Não foi possível carregar o fechamento do dia'
              : 'Unable to load daily closing'}
          </Text>
          <Button
            label={t.common.retry}
            variant="secondary"
            fullWidth={false}
            onPress={() => void closingQuery.refetch()}
          />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Hero Daily Balance */}
            <Card style={styles.heroCard}>
              <Text style={styles.overline}>
                {locale === 'pt-BR' ? 'SALDO LÍQUIDO DO DIA' : 'DAILY NET BALANCE'}
              </Text>
              <Text
                style={[
                  styles.netAmount,
                  closing.netCashFlow < 0 && styles.netAmountNegative,
                ]}
              >
                {closing.netCashFlow < 0
                  ? `- ${formatCurrency(Math.abs(closing.netCashFlow))}`
                  : formatCurrency(closing.netCashFlow)}
              </Text>

              <View style={styles.dualPills}>
                <View style={styles.inPill}>
                  <View style={styles.pillTitleRow}>
                    <ArrowUp size={13} color={colors.successDark} />
                    <Text style={styles.inLabel}>
                      {locale === 'pt-BR'
                        ? `Entradas (${closing.incomeCount})`
                        : `Income (${closing.incomeCount})`}
                    </Text>
                  </View>
                  <Text style={styles.inVal}>+ {formatCurrency(closing.totalIncomePaid)}</Text>
                </View>

                <View style={styles.outPill}>
                  <View style={styles.pillTitleRow}>
                    <ArrowDown size={13} color={colors.dangerDark} />
                    <Text style={styles.outLabel}>
                      {locale === 'pt-BR'
                        ? `Saídas (${closing.expenseCount})`
                        : `Expenses (${closing.expenseCount})`}
                    </Text>
                  </View>
                  <Text style={styles.outVal}>- {formatCurrency(closing.totalExpensePaid)}</Text>
                </View>
              </View>

              {/* Cash Drawer Expected Balance */}
              <View style={styles.drawerBox}>
                <View style={styles.drawerLeft}>
                  <Banknote size={16} color={colors.successDark} />
                  <Text style={styles.drawerLabel}>
                    {locale === 'pt-BR'
                      ? 'Dinheiro líquido esperado na gaveta'
                      : 'Expected net cash in drawer'}
                  </Text>
                </View>
                <Text style={styles.drawerValue}>{formatCurrency(cashDrawerNet)}</Text>
              </View>
            </Card>

            {/* Breakdown by Payment Method */}
            <Card style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <Wallet size={16} color={colors.brandPrimary} />
                <Text style={styles.sectionTitle}>
                  {locale === 'pt-BR'
                    ? 'Conferência por Forma de Pagamento'
                    : 'Breakdown by Payment Method'}
                </Text>
              </View>

              <View style={styles.methodList}>
                {METHODS.map((method) => {
                  const inc = Number(closing.incomeByPaymentMethod[method] ?? 0);
                  const exp = Number(closing.expenseByPaymentMethod[method] ?? 0);
                  const net = inc - exp;
                  return (
                    <View key={method} style={styles.methodRow}>
                      <View style={styles.methodLeft}>
                        <Text style={styles.methodName}>{t.paymentMethod[method]}</Text>
                        {exp > 0 ? (
                          <Text style={styles.methodSub}>
                            {locale === 'pt-BR' ? 'Saídas: ' : 'Out: '}- {formatCurrency(exp)}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.methodRight}>
                        <Text style={styles.methodNet}>{formatCurrency(net)}</Text>
                        {exp > 0 ? (
                          <Text style={styles.methodInHint}>
                            {locale === 'pt-BR' ? 'Entradas: ' : 'In: '}+ {formatCurrency(inc)}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            </Card>

            {/* Settled Transactions List */}
            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                {locale === 'pt-BR'
                  ? `Movimentações Liquidadas (${closing.transactions.length})`
                  : `Settled Movements (${closing.transactions.length})`}
              </Text>

              {closing.transactions.length === 0 ? (
                <Text style={styles.emptySub}>
                  {locale === 'pt-BR'
                    ? 'Nenhuma entrada ou saída paga nesta data.'
                    : 'No paid income or expenses on this date.'}
                </Text>
              ) : (
                <View style={styles.txList}>
                  {closing.transactions.map((tx, idx) => {
                    const isIncome = tx.type === 'INCOME';
                    return (
                      <View
                        key={tx.id}
                        style={[styles.txRow, idx > 0 && styles.txRowBorder]}
                      >
                        <View style={styles.txInfo}>
                          <Text style={styles.txDesc} numberOfLines={1}>
                            {formatTransactionDescription(tx.description, locale)}
                          </Text>
                          <Text style={styles.txMeta}>
                            {formatHour(tx.paidAt ?? tx.createdAt)} ·{' '}
                            {t.paymentMethod[tx.paymentMethod]}
                            {tx.supplierName ? ` · ${tx.supplierName}` : ''}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.txAmount,
                            isIncome ? styles.txAmountIn : styles.txAmountOut,
                          ]}
                        >
                          {isIncome ? '+' : '-'} {formatCurrency(tx.amount)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </Card>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <Button
              label={
                locale === 'pt-BR'
                  ? 'Compartilhar Fechamento em PDF'
                  : 'Share Daily Closing PDF'
              }
              icon={<FileText size={16} color={colors.textOnDark} />}
              loading={exportingPdf}
              onPress={() => void handleExportPdf()}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgCanvas,
  },
  header: {
    height: 58,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 36,
  },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  dateArrowBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateArrowDisabled: {
    opacity: 0.35,
  },
  dateBarLabel: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 14.5,
    color: colors.textPrimary,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  errorTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 15,
    color: colors.dangerDark,
    textAlign: 'center',
  },
  scrollContent: {
    padding: spacing.lg,
    gap: 14,
    paddingBottom: 28,
  },
  heroCard: {
    gap: 12,
  },
  overline: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.textMuted,
  },
  netAmount: {
    fontFamily: fonts.monoBold,
    fontSize: 28,
    color: colors.textPrimary,
    letterSpacing: -0.6,
  },
  netAmountNegative: {
    color: colors.dangerDark,
  },
  dualPills: {
    flexDirection: 'row',
    gap: 10,
  },
  inPill: {
    flex: 1,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: radius.lg,
    padding: 10,
    gap: 4,
  },
  outPill: {
    flex: 1,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.lg,
    padding: 10,
    gap: 4,
  },
  pillTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11.5,
    color: colors.successDark,
  },
  outLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11.5,
    color: colors.dangerDark,
  },
  inVal: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    color: colors.successDark,
  },
  outVal: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    color: colors.dangerDark,
  },
  drawerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  drawerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  drawerLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  drawerValue: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
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
    fontSize: 14.5,
    color: colors.textPrimary,
  },
  methodList: {
    gap: 8,
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  methodLeft: {
    gap: 2,
  },
  methodName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13.5,
    color: colors.textPrimary,
  },
  methodSub: {
    fontFamily: fonts.bodyRegular,
    fontSize: 11,
    color: colors.dangerDark,
  },
  methodRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  methodNet: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  methodInHint: {
    fontFamily: fonts.bodyRegular,
    fontSize: 11,
    color: colors.successDark,
  },
  emptySub: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 12,
  },
  txList: {
    gap: 0,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
  },
  txRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  txInfo: {
    flex: 1,
    gap: 2,
  },
  txDesc: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  txMeta: {
    fontFamily: fonts.bodyRegular,
    fontSize: 11.5,
    color: colors.textMuted,
  },
  txAmount: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
  },
  txAmountIn: {
    color: colors.successDark,
  },
  txAmountOut: {
    color: colors.dangerDark,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
});
