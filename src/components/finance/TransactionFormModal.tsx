import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, X } from 'lucide-react-native';
import { financeApi } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type {
  CreateFinancialTransactionRequest,
  TransactionCategory,
  TransactionPaymentMethod,
  TransactionStatus,
  TransactionType,
} from '@/types/api';
import { maskCurrencyBRL, maskDateBR, parseCurrencyBRL } from '@/utils/masks';

interface TransactionFormModalProps {
  visible: boolean;
  onClose: () => void;
}

const EXPENSE_CATEGORIES: TransactionCategory[] = [
  'PARTS_PURCHASE',
  'OPERATIONAL_EXPENSE',
  'OTHER',
];

const INCOME_CATEGORIES: TransactionCategory[] = ['REPAIR_PAYMENT', 'OTHER'];

const EXPENSE_METHODS: TransactionPaymentMethod[] = [
  'PIX',
  'CASH',
  'DEBIT_CARD',
  'CREDIT_CARD',
  'STORE_CREDIT',
];

const INCOME_METHODS: TransactionPaymentMethod[] = [
  'PIX',
  'CASH',
  'DEBIT_CARD',
  'CREDIT_CARD',
];

function formatDateInputPt(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function parsePtDateToIso(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const monthNum = Number(mm);
  const dayNum = Number(dd);
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function defaultDueDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return formatDateInputPt(d);
}

export function TransactionFormModal({ visible, onClose }: TransactionFormModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible ? <TransactionFormBody onClose={onClose} /> : null}
    </Modal>
  );
}

function TransactionFormBody({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardVisible();
  const { locale, t } = useI18n();

  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [category, setCategory] = useState<TransactionCategory>('PARTS_PURCHASE');
  const [description, setDescription] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<TransactionPaymentMethod>('PIX');
  const [status, setStatus] = useState<TransactionStatus>('PAID');
  const [supplierId, setSupplierId] = useState<string | undefined>(undefined);
  const [dueDateInput, setDueDateInput] = useState(() => defaultDueDateString());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const suppliersQuery = useQuery({
    queryKey: ['finance-suppliers'],
    queryFn: () => financeApi.listSuppliers(),
  });

  const handleSelectType = (nextType: TransactionType) => {
    setType(nextType);
    if (nextType === 'INCOME') {
      setCategory('REPAIR_PAYMENT');
      if (paymentMethod === 'STORE_CREDIT') {
        setPaymentMethod('PIX');
      }
      setStatus('PAID');
      setSupplierId(undefined);
    } else {
      setCategory('PARTS_PURCHASE');
    }
  };

  const handleSelectMethod = (method: TransactionPaymentMethod) => {
    setPaymentMethod(method);
    if (method === 'STORE_CREDIT') {
      setStatus('PENDING');
      if (!dueDateInput.trim()) {
        setDueDateInput(defaultDueDateString());
      }
    } else {
      setStatus('PAID');
    }
  };

  const createMutation = useMutation({
    mutationFn: (payload: CreateFinancialTransactionRequest) =>
      financeApi.createTransaction(payload),
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
      setErrorMessage(err instanceof Error ? err.message : t.common.errorGeneric);
    },
  });

  const categoryLabels: Record<TransactionCategory, string> =
    locale === 'pt-BR'
      ? {
          PARTS_PURCHASE: 'Compra de Peças',
          OPERATIONAL_EXPENSE: 'Despesa Operacional',
          REPAIR_PAYMENT: 'Pagamento de Reparo',
          OTHER: 'Outros',
        }
      : {
          PARTS_PURCHASE: 'Parts Purchase',
          OPERATIONAL_EXPENSE: 'Operational',
          REPAIR_PAYMENT: 'Repair Payment',
          OTHER: 'Other',
        };

  const handleSubmit = () => {
    setErrorMessage(null);
    const trimmedDesc = description.trim();
    if (!trimmedDesc) {
      setErrorMessage(
        locale === 'pt-BR' ? 'Informe uma descrição para o lançamento.' : 'Enter a description.'
      );
      return;
    }

    const numericAmount = parseCurrencyBRL(amountInput);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setErrorMessage(
        locale === 'pt-BR' ? 'Informe um valor válido maior que zero.' : 'Enter a valid amount > 0.'
      );
      return;
    }

    const isPending = paymentMethod === 'STORE_CREDIT' || status === 'PENDING';
    let isoDueDate: string | undefined;
    if (isPending) {
      const parsed = parsePtDateToIso(dueDateInput);
      if (!parsed) {
        setErrorMessage(
          locale === 'pt-BR'
            ? 'Informe o vencimento no formato DD/MM/AAAA.'
            : 'Enter due date as DD/MM/YYYY.'
        );
        return;
      }
      isoDueDate = parsed;
    }

    const payload: CreateFinancialTransactionRequest = {
      type,
      category,
      description: trimmedDesc,
      amount: Number(numericAmount.toFixed(2)),
      paymentMethod,
      status: isPending ? 'PENDING' : 'PAID',
      ...(type === 'EXPENSE' && supplierId ? { supplierId } : {}),
      ...(isoDueDate ? { dueDate: isoDueDate } : {}),
    };

    createMutation.mutate(payload);
  };

  const categories = type === 'EXPENSE' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const methods = type === 'EXPENSE' ? EXPENSE_METHODS : INCOME_METHODS;
  const suppliers = suppliersQuery.data ?? [];
  const isPendingMode = paymentMethod === 'STORE_CREDIT' || status === 'PENDING';

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={locale === 'pt-BR' ? 'Fechar' : 'Close'}
      />
      <View
        style={[
          styles.sheet,
            {
              paddingBottom: isKeyboardVisible
                ? spacing.lg
                : Math.max(insets.bottom + spacing.md, spacing.xxl),
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>
              {locale === 'pt-BR' ? 'Novo lançamento' : 'New transaction'}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.formBody}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
          >
            {/* Type Switcher */}
            <View style={styles.typeRow}>
              <Pressable
                onPress={() => handleSelectType('EXPENSE')}
                style={[
                  styles.typePill,
                  type === 'EXPENSE' && styles.typePillExpenseActive,
                ]}
              >
                <ArrowDownLeft
                  size={16}
                  color={type === 'EXPENSE' ? colors.dangerDark : colors.textMuted}
                />
                <Text
                  style={[
                    styles.typeText,
                    type === 'EXPENSE' && styles.typeTextExpenseActive,
                  ]}
                >
                  {locale === 'pt-BR' ? 'Despesa' : 'Expense'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => handleSelectType('INCOME')}
                style={[
                  styles.typePill,
                  type === 'INCOME' && styles.typePillIncomeActive,
                ]}
              >
                <ArrowUpRight
                  size={16}
                  color={type === 'INCOME' ? colors.successDark : colors.textMuted}
                />
                <Text
                  style={[
                    styles.typeText,
                    type === 'INCOME' && styles.typeTextIncomeActive,
                  ]}
                >
                  {locale === 'pt-BR' ? 'Receita' : 'Income'}
                </Text>
              </Pressable>
            </View>

            {/* Category */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                {locale === 'pt-BR' ? 'Categoria' : 'Category'}
              </Text>
              <View style={styles.chipWrap}>
                {categories.map((cat) => {
                  const active = category === cat;
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => setCategory(cat)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {categoryLabels[cat]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <TextField
              label={locale === 'pt-BR' ? 'Descrição' : 'Description'}
              value={description}
              onChangeText={setDescription}
              placeholder={
                type === 'EXPENSE'
                  ? locale === 'pt-BR'
                    ? 'Ex: Compra de magnetrons, conta de luz...'
                    : 'e.g. Magnetron parts, electricity bill...'
                  : locale === 'pt-BR'
                    ? 'Ex: Venda de peça avulsa, ajuste...'
                    : 'e.g. Spare part sale, adjustment...'
              }
            />

            <TextField
              label={locale === 'pt-BR' ? 'Valor (R$)' : 'Amount (R$)'}
              value={amountInput}
              onChangeText={(val) => setAmountInput(maskCurrencyBRL(val))}
              placeholder="0,00"
              keyboardType="number-pad"
              mono
            />

            {/* Payment Method */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                {locale === 'pt-BR' ? 'Forma de pagamento' : 'Payment method'}
              </Text>
              <View style={styles.chipWrap}>
                {methods.map((method) => {
                  const active = paymentMethod === method;
                  return (
                    <Pressable
                      key={method}
                      onPress={() => handleSelectMethod(method)}
                      style={[
                        styles.chip,
                        active &&
                          (method === 'STORE_CREDIT'
                            ? styles.chipWarningActive
                            : styles.chipActive),
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active &&
                            (method === 'STORE_CREDIT'
                              ? styles.chipWarningTextActive
                              : styles.chipTextActive),
                        ]}
                      >
                        {t.paymentMethod[method]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Supplier selector for expenses */}
            {type === 'EXPENSE' && suppliers.length > 0 ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  {locale === 'pt-BR' ? 'Fornecedor (opcional)' : 'Supplier (optional)'}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalChips}
                >
                  <Pressable
                    onPress={() => setSupplierId(undefined)}
                    style={[styles.chip, !supplierId && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, !supplierId && styles.chipTextActive]}>
                      {locale === 'pt-BR' ? 'Nenhum' : 'None'}
                    </Text>
                  </Pressable>
                  {suppliers.map((sup) => {
                    const active = supplierId === sup.id;
                    return (
                      <Pressable
                        key={sup.id}
                        onPress={() => setSupplierId(sup.id)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {sup.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {/* Pending / Due Date */}
            {type === 'EXPENSE' && paymentMethod !== 'STORE_CREDIT' ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  {locale === 'pt-BR' ? 'Situação' : 'Status'}
                </Text>
                <View style={styles.chipWrap}>
                  <Pressable
                    onPress={() => setStatus('PAID')}
                    style={[styles.chip, status === 'PAID' && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, status === 'PAID' && styles.chipTextActive]}>
                      {locale === 'pt-BR' ? 'Já pago' : 'Paid'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setStatus('PENDING');
                      if (!dueDateInput.trim()) setDueDateInput(defaultDueDateString());
                    }}
                    style={[styles.chip, status === 'PENDING' && styles.chipWarningActive]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        status === 'PENDING' && styles.chipWarningTextActive,
                      ]}
                    >
                      {locale === 'pt-BR' ? 'A pagar (pendente)' : 'Pending payable'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {isPendingMode ? (
              <TextField
                label={locale === 'pt-BR' ? 'Data de vencimento (DD/MM/AAAA)' : 'Due date (DD/MM/YYYY)'}
                value={dueDateInput}
                onChangeText={(val) => setDueDateInput(maskDateBR(val))}
                placeholder="DD/MM/AAAA"
                keyboardType="number-pad"
                maxLength={10}
                mono
              />
            ) : null}

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <View style={styles.footerActions}>
              <Button
                label={t.common.cancel}
                variant="secondary"
                onPress={onClose}
                style={styles.actionBtn}
              />
              <Button
                label={locale === 'pt-BR' ? 'Salvar lançamento' : 'Save entry'}
                loading={createMutation.isPending}
                onPress={handleSubmit}
                style={styles.actionBtn}
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bgSurface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  formBody: {
    gap: 14,
    paddingBottom: 12,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typePill: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgCanvas,
  },
  typePillExpenseActive: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  typePillIncomeActive: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successBorder,
  },
  typeText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textSecondary,
  },
  typeTextExpenseActive: {
    fontFamily: fonts.bodySemiBold,
    color: colors.dangerDark,
  },
  typeTextIncomeActive: {
    fontFamily: fonts.bodySemiBold,
    color: colors.successDark,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  horizontalChips: {
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSurface,
  },
  chipActive: {
    backgroundColor: colors.brandPrimarySoft,
    borderColor: colors.brandPrimary,
  },
  chipWarningActive: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  chipTextActive: {
    fontFamily: fonts.bodySemiBold,
    color: colors.brandPrimary,
  },
  chipWarningTextActive: {
    fontFamily: fonts.bodySemiBold,
    color: colors.warningDark,
  },
  errorText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.danger,
  },
  footerActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
  },
});
