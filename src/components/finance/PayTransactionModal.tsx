import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, X } from 'lucide-react-native';
import { financeApi } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { FinancialTransactionResponse, OrderPaymentMethod } from '@/types/api';
import { formatTransactionDescription } from '@/utils/transactionDescription';

const SETTLEMENT_METHODS: OrderPaymentMethod[] = ['PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD'];

interface PayTransactionModalProps {
  visible: boolean;
  transaction: FinancialTransactionResponse | null;
  onClose: () => void;
}

export function PayTransactionModal({
  visible,
  transaction,
  onClose,
}: PayTransactionModalProps) {
  if (!transaction) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {visible ? (
        <PayTransactionBody key={transaction.id} transaction={transaction} onClose={onClose} />
      ) : null}
    </Modal>
  );
}

function PayTransactionBody({
  transaction,
  onClose,
}: {
  transaction: FinancialTransactionResponse;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { locale, t, formatCurrency, formatShortDate } = useI18n();
  const [selectedMethod, setSelectedMethod] = useState<OrderPaymentMethod>('PIX');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const payMutation = useMutation({
    mutationFn: () => financeApi.payTransaction(transaction.id, selectedMethod),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['finance-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['finance-transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['finance-pending'] }),
        queryClient.invalidateQueries({ queryKey: ['finance-daily-closing'] }),
      ]);
      onClose();
    },
    onError: (err) => {
      setErrorMessage(
        err instanceof Error ? err.message : t.common.errorGeneric
      );
    },
  });

  return (
    <View style={[styles.backdrop, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={locale === 'pt-BR' ? 'Fechar' : 'Close'}
      />
      <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <CheckCircle2 size={18} color={colors.brandPrimary} />
              <Text style={styles.title}>
                {locale === 'pt-BR' ? 'Quitar conta pendente' : 'Settle pending payable'}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.summaryBox}>
            <Text style={styles.summaryDesc} numberOfLines={2}>
              {transaction.supplierName
                ? `${transaction.supplierName} · ${formatTransactionDescription(transaction.description, locale)}`
                : formatTransactionDescription(transaction.description, locale)}
            </Text>
            <View style={styles.summaryMetaRow}>
              {transaction.dueDate ? (
                <Text style={styles.summaryMeta}>
                  {locale === 'pt-BR' ? 'Vencimento' : 'Due'}: {formatShortDate(transaction.dueDate)}
                </Text>
              ) : null}
              <Text style={styles.summaryAmount}>{formatCurrency(transaction.amount)}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>
              {locale === 'pt-BR' ? 'Forma de pagamento utilizada' : 'Payment method used'}
            </Text>
            <View style={styles.methodGrid}>
              {SETTLEMENT_METHODS.map((method) => {
                const active = selectedMethod === method;
                return (
                  <Pressable
                    key={method}
                    onPress={() => setSelectedMethod(method)}
                    style={[styles.methodChip, active && styles.methodChipActive]}
                  >
                    <Text style={[styles.methodChipText, active && styles.methodChipTextActive]}>
                      {t.orderPaymentMethod[method]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <View style={styles.actions}>
            <Button
              label={t.common.cancel}
              variant="secondary"
              onPress={onClose}
              style={styles.actionBtn}
            />
            <Button
              label={locale === 'pt-BR' ? 'Confirmar quitação' : 'Confirm payment'}
              loading={payMutation.isPending}
              onPress={() => payMutation.mutate()}
              style={styles.actionBtn}
            />
          </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  summaryBox: {
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: 12,
    gap: 6,
  },
  summaryDesc: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  summaryMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryMeta: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.textMuted,
  },
  summaryAmount: {
    fontFamily: fonts.monoBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  section: {
    gap: 8,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  methodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  methodChip: {
    flexBasis: '48%',
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  methodChipActive: {
    backgroundColor: colors.brandPrimarySoft,
    borderColor: colors.brandPrimary,
  },
  methodChipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  methodChipTextActive: {
    fontFamily: fonts.bodySemiBold,
    color: colors.brandPrimary,
  },
  errorText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.danger,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
  },
});
