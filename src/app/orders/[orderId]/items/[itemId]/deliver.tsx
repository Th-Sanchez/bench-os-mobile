import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Plus, Trash2, User, X } from 'lucide-react-native';
import { ordersApi } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TagBadge } from '@/components/ui/TagBadge';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { OrderPaymentMethod } from '@/types/api';

const PAYMENT_METHODS: OrderPaymentMethod[] = ['PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH'];

interface PaymentDraft {
  localId: string;
  paymentMethod: OrderPaymentMethod;
  amountText: string;
}

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, '').replace(',', '.');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
}

function formatInputAmount(value: number): string {
  return Math.max(0, value).toFixed(2).replace('.', ',');
}

export default function DeliverItemScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { orderId, itemId } = useLocalSearchParams<{ orderId: string; itemId: string }>();
  const { t, locale, formatCurrency } = useI18n();

  const orderQuery = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => ordersApi.get(orderId),
    enabled: Boolean(orderId),
  });

  const order = orderQuery.data;
  const item = useMemo(
    () => order?.items.find((i) => i.id === itemId),
    [order, itemId]
  );

  const [customParts, setCustomParts] = useState<PaymentDraft[] | null>(null);

  const isFreeReturn = item?.status === 'REJECTED' || (item?.totalPrice ?? 0) <= 0;
  const expectedTotal = isFreeReturn ? 0 : (item?.totalPrice ?? 0);

  const parts = useMemo<PaymentDraft[]>(() => {
    if (customParts !== null) return customParts;
    if (!item || isFreeReturn) return [];
    return [
      {
        localId: 'part-1',
        paymentMethod: 'PIX',
        amountText: formatInputAmount(item.totalPrice),
      },
    ];
  }, [customParts, item, isFreeReturn]);

  const enteredSum = useMemo(() => {
    const sum = parts.reduce((acc, p) => acc + parseAmount(p.amountText), 0);
    return Math.round(sum * 100) / 100;
  }, [parts]);

  const remaining = Math.round((expectedTotal - enteredSum) * 100) / 100;
  const allPartsPositive = parts.every((p) => parseAmount(p.amountText) > 0);
  const isBalanced = isFreeReturn || (parts.length > 0 && allPartsPositive && Math.abs(remaining) < 0.005);

  const deliverMutation = useMutation({
    mutationFn: () => {
      if (isFreeReturn) {
        return ordersApi.deliverItem(orderId, itemId, {});
      }
      return ordersApi.deliverItem(orderId, itemId, {
        payments: parts.map((p) => ({
          paymentMethod: p.paymentMethod,
          amount: parseAmount(p.amountText),
        })),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['bench-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['orders-list'] });
      void queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['finance-transactions'] });

      Alert.alert(
        locale === 'pt-BR' ? 'Entrega registrada!' : 'Delivery recorded!',
        isFreeReturn
          ? locale === 'pt-BR'
            ? 'Aparelho devolvido sem cobrança.'
            : 'Appliance returned without charge.'
          : locale === 'pt-BR'
            ? 'Pagamento confirmado e lançado automaticamente no financeiro.'
            : 'Payment confirmed and automatically recorded in finance.',
        [{ text: 'OK', onPress: () => router.replace('/(tabs)/workbench') }]
      );
    },
    onError: (err) => {
      Alert.alert(
        locale === 'pt-BR' ? 'Não foi possível concluir' : 'Could not complete delivery',
        err instanceof ApiError ? err.message : t.common.errorGeneric
      );
    },
  });

  const handleAddSplit = () => {
    const nextMethod = PAYMENT_METHODS[parts.length % PAYMENT_METHODS.length];
    const suggested = remaining > 0 ? remaining : 0;
    setCustomParts([
      ...parts,
      {
        localId: `part-${Date.now()}-${parts.length}`,
        paymentMethod: nextMethod,
        amountText: suggested > 0 ? formatInputAmount(suggested) : '',
      },
    ]);
  };

  const handleRemoveSplit = (localId: string) => {
    if (parts.length <= 1) return;
    setCustomParts(parts.filter((p) => p.localId !== localId));
  };

  const updatePart = (localId: string, patch: Partial<PaymentDraft>) => {
    setCustomParts(parts.map((p) => (p.localId === localId ? { ...p, ...patch } : p)));
  };

  if (orderQuery.isLoading || !order || !item) {
    return (
      <SafeAreaView style={styles.centerBox}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </SafeAreaView>
    );
  }

  const applianceTitle = [item.applianceType, item.brand, item.model].filter(Boolean).join(' ');

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top Bar */}
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={8}>
            <X size={20} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.topTitle}>
            {locale === 'pt-BR' ? 'Registrar Entrega' : 'Record Delivery'}
          </Text>
          <TagBadge label={`#${item.tag}`} variant="dark" />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Appliance & Total Summary Card */}
          <Card style={styles.summaryCard}>
            <View style={styles.summaryTopRow}>
              <Text style={styles.applianceTitle} numberOfLines={1}>
                {applianceTitle}
              </Text>
              <View style={styles.warrantyPill}>
                <Text style={styles.warrantyText}>
                  {locale === 'pt-BR' ? `Garantia ${item.warrantyDays}d` : `${item.warrantyDays}d`}
                </Text>
              </View>
            </View>

            <View style={styles.customerRow}>
              <User size={14} color={colors.textMuted} />
              <Text style={styles.customerName}>{order.customerName ?? '—'}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.totalReceiveRow}>
              <Text style={styles.totalReceiveLabel}>
                {locale === 'pt-BR' ? 'TOTAL A RECEBER' : 'TOTAL DUE'}
              </Text>
              <Text style={styles.totalReceiveValue}>{formatCurrency(expectedTotal)}</Text>
            </View>
          </Card>

          {isFreeReturn ? (
            <Card accentBorderColor={colors.brandPrimaryBorder} style={styles.freeReturnCard}>
              <Text style={styles.freeReturnTitle}>
                {locale === 'pt-BR'
                  ? 'Devolução sem cobrança'
                  : 'Zero-charge return'}
              </Text>
              <Text style={styles.freeReturnDesc}>
                {locale === 'pt-BR'
                  ? 'Este aparelho foi recusado ou está com valor R$ 0,00. Ao confirmar, ele será marcado como Entregue sem gerar lançamento no financeiro.'
                  : 'This item was rejected or has a zero balance. Confirming marks it Delivered with no financial transaction.'}
              </Text>
            </Card>
          ) : (
            <>
              {/* Payment Splits Section Header */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionOverline}>
                  {locale === 'pt-BR' ? 'FORMAS DE PAGAMENTO' : 'PAYMENT METHODS'}
                </Text>
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>
                    {parts.length}{' '}
                    {locale === 'pt-BR'
                      ? parts.length === 1
                        ? 'parcela'
                        : 'parcelas'
                      : parts.length === 1
                        ? 'part'
                        : 'parts'}
                  </Text>
                </View>
              </View>

              {parts.map((part, idx) => {
                const parsedValue = parseAmount(part.amountText);
                return (
                  <Card key={part.localId} style={styles.partCard}>
                    <View style={styles.partHeader}>
                      <Text style={styles.partTitle}>
                        {locale === 'pt-BR' ? `Pagamento ${idx + 1}` : `Payment ${idx + 1}`}
                      </Text>
                      {parts.length > 1 ? (
                        <Pressable
                          onPress={() => handleRemoveSplit(part.localId)}
                          style={styles.removeBtn}
                        >
                          <Trash2 size={13} color={colors.danger} />
                          <Text style={styles.removeText}>{t.common.remove}</Text>
                        </Pressable>
                      ) : (
                        <Text style={styles.partSubtitle}>
                          {locale === 'pt-BR' ? '1ª parte' : 'Part 1'}
                        </Text>
                      )}
                    </View>

                    {/* 4-column Payment Method Selector */}
                    <View style={styles.methodGrid}>
                      {PAYMENT_METHODS.map((method) => {
                        const active = part.paymentMethod === method;
                        return (
                          <Pressable
                            key={method}
                            onPress={() => updatePart(part.localId, { paymentMethod: method })}
                            style={[styles.methodBtn, active && styles.methodBtnActive]}
                          >
                            <Text
                              numberOfLines={1}
                              style={[styles.methodText, active && styles.methodTextActive]}
                            >
                              {t.orderPaymentMethod[method]}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {/* Currency Input */}
                    <View style={styles.amountGroup}>
                      <Text style={styles.amountLabel}>
                        {locale === 'pt-BR' ? 'Valor' : 'Amount'}
                      </Text>
                      <View style={styles.amountInputBox}>
                        <Text style={styles.currencyPrefix}>R$</Text>
                        <TextInput
                          value={part.amountText}
                          onChangeText={(val) => updatePart(part.localId, { amountText: val })}
                          placeholder="0,00"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="decimal-pad"
                          style={styles.amountInput}
                        />
                        {parsedValue > 0 ? (
                          <View style={styles.okBadge}>
                            <Text style={styles.okBadgeText}>OK</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </Card>
                );
              })}

              {/* Add Split Payment Button */}
              <Button
                label={
                  locale === 'pt-BR'
                    ? '+ Adicionar outra forma de pagamento'
                    : '+ Add another payment method'
                }
                variant="dashed"
                onPress={handleAddSplit}
                icon={<Plus size={16} color={colors.brandPrimary} />}
              />

              {/* Live Reconciliation Card */}
              <View
                style={[
                  styles.reconcileCard,
                  isBalanced ? styles.reconcileVerified : styles.reconcilePending,
                ]}
              >
                <View style={styles.reconcileRow}>
                  <Text style={styles.reconcileLabel}>
                    {locale === 'pt-BR' ? 'Soma dos pagamentos' : 'Payment sum'}
                  </Text>
                  <Text style={styles.reconcileSum}>{formatCurrency(enteredSum)}</Text>
                </View>

                <View
                  style={[
                    styles.reconcileDivider,
                    isBalanced ? styles.reconcileDividerOk : styles.reconcileDividerWarn,
                  ]}
                />

                <View style={styles.reconcileStatusRow}>
                  <View style={styles.reconcileLeft}>
                    {isBalanced ? (
                      <CheckCircle2 size={16} color={colors.successDark} />
                    ) : (
                      <AlertCircle size={16} color={colors.warningDark} />
                    )}
                    <Text
                      style={[
                        styles.reconcileStatusText,
                        isBalanced ? styles.reconcileTextOk : styles.reconcileTextWarn,
                      ]}
                    >
                      {isBalanced
                        ? locale === 'pt-BR'
                          ? 'Valor conferido — pronto para entrega'
                          : 'Balanced — ready to deliver'
                        : remaining > 0
                          ? locale === 'pt-BR'
                            ? 'Falta completar o total'
                            : 'Remaining balance'
                          : locale === 'pt-BR'
                            ? 'Soma ultrapassa o total'
                            : 'Exceeds total due'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.deltaBadge,
                      isBalanced ? styles.deltaBadgeOk : styles.deltaBadgeWarn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.deltaText,
                        isBalanced ? styles.reconcileTextOk : styles.reconcileTextWarn,
                      ]}
                    >
                      {remaining >= 0
                        ? `${locale === 'pt-BR' ? 'Falta' : 'Left'} ${formatCurrency(remaining)}`
                        : `+ ${formatCurrency(Math.abs(remaining))}`}
                    </Text>
                  </View>
                </View>
              </View>
            </>
          )}
        </ScrollView>

        {/* Sticky Bottom CTA */}
        <View style={styles.stickyFooter}>
          <Button
            label={
              isFreeReturn
                ? locale === 'pt-BR'
                  ? 'Confirmar Devolução · R$ 0,00'
                  : 'Confirm Free Return · R$ 0,00'
                : `${locale === 'pt-BR' ? 'Confirmar Entrega' : 'Confirm Delivery'} · ${formatCurrency(expectedTotal)}`
            }
            disabled={!isBalanced}
            loading={deliverMutation.isPending}
            icon={
              !deliverMutation.isPending ? (
                <CheckCircle2 size={18} color={colors.textOnDark} />
              ) : undefined
            }
            onPress={() => deliverMutation.mutate()}
          />
          <Text style={styles.footerCaption}>
            {isFreeReturn
              ? locale === 'pt-BR'
                ? 'Sem impacto no caixa da oficina'
                : 'No financial transaction will be recorded'
              : locale === 'pt-BR'
                ? 'As receitas entram automaticamente no financeiro'
                : 'Income entries are recorded automatically in finance'}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgCanvas,
  },
  flex: { flex: 1 },
  centerBox: {
    flex: 1,
    backgroundColor: colors.bgCanvas,
    alignItems: 'center',
    justifyContent: 'center',
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
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 16.5,
    color: colors.textPrimary,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 28,
    gap: 14,
  },
  summaryCard: {
    gap: 10,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  applianceTitle: {
    flex: 1,
    fontFamily: fonts.headlineBold,
    fontSize: 15.5,
    color: colors.textPrimary,
  },
  warrantyPill: {
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  warrantyText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customerName: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12.5,
    color: colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  totalReceiveRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  totalReceiveLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.textMuted,
  },
  totalReceiveValue: {
    fontFamily: fonts.monoBold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  freeReturnCard: {
    backgroundColor: colors.brandPrimarySoft,
    gap: 6,
  },
  freeReturnTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 15,
    color: colors.infoDark,
  },
  freeReturnDesc: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionOverline: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.textMuted,
  },
  countPill: {
    backgroundColor: colors.borderSubtle,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  countPillText: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: colors.neutralDark,
  },
  partCard: {
    gap: 12,
  },
  partHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  partTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  partSubtitle: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: colors.textMuted,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  removeText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.danger,
  },
  methodGrid: {
    flexDirection: 'row',
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  methodBtn: {
    flex: 1,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodBtnActive: {
    backgroundColor: colors.darkPillBg,
  },
  methodText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  methodTextActive: {
    color: colors.textOnDark,
    fontFamily: fonts.bodySemiBold,
  },
  amountGroup: {
    gap: 4,
  },
  amountLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11.5,
    color: colors.textMuted,
  },
  amountInputBox: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    gap: 6,
  },
  currencyPrefix: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    color: colors.textMuted,
  },
  amountInput: {
    flex: 1,
    fontFamily: fonts.monoBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  okBadge: {
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  okBadgeText: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: colors.successDark,
  },
  reconcileCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  reconcileVerified: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successBorder,
  },
  reconcilePending: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder,
  },
  reconcileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reconcileLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  reconcileSum: {
    fontFamily: fonts.monoBold,
    fontSize: 13.5,
    color: colors.textPrimary,
  },
  reconcileDivider: {
    height: 1,
  },
  reconcileDividerOk: {
    backgroundColor: colors.successBorder,
  },
  reconcileDividerWarn: {
    backgroundColor: colors.warningBorder,
  },
  reconcileStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  reconcileLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reconcileStatusText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    flexShrink: 1,
  },
  reconcileTextOk: {
    color: colors.successDark,
  },
  reconcileTextWarn: {
    color: colors.warningDark,
  },
  deltaBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  deltaBadgeOk: {
    backgroundColor: '#D1FAE5',
  },
  deltaBadgeWarn: {
    backgroundColor: '#FEF3C7',
  },
  deltaText: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
  },
  stickyFooter: {
    padding: spacing.lg,
    gap: 8,
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  footerCaption: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10.5,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
