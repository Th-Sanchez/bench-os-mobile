import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  MessageCircle,
  PenTool,
  Plus,
  ShieldCheck,
  Trash2,
  User,
  X,
} from 'lucide-react-native';
import { ordersApi, tenantSettingsApi } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { useAuth } from '@/auth/AuthProvider';
import { SignaturePad, SignaturePreview } from '@/components/orders/SignaturePad';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TagBadge } from '@/components/ui/TagBadge';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { OrderPaymentMethod, ServiceOrderItemResponse } from '@/types/api';
import { formatCurrencyInput, maskCurrencyBRL, parseCurrencyBRL } from '@/utils/masks';
import {
  computeWarrantyInfo,
  formatFullDate,
  sendConsolidatedOrderReceiptWhatsapp,
  shareConsolidatedOrderReceiptPdf,
  type ReceiptPaymentPart,
} from '@/utils/warrantyReceiptPdf';

const PAYMENT_METHODS: OrderPaymentMethod[] = ['PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH'];

interface PaymentDraft {
  localId: string;
  paymentMethod: OrderPaymentMethod;
  amountText: string;
}

export default function DeliverItemScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardVisible();
  const { session } = useAuth();
  const { orderId, itemId } = useLocalSearchParams<{ orderId: string; itemId: string }>();
  const { t, locale, formatCurrency } = useI18n();

  const [deliveredReceipt, setDeliveredReceipt] = useState<{
    item: ServiceOrderItemResponse;
    payments: ReceiptPaymentPart[];
  } | null>(null);
  const [sharingPdf, setSharingPdf] = useState(false);

  const orderQuery = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => ordersApi.get(orderId),
    enabled: Boolean(orderId),
  });

  const settingsQuery = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.get(),
    staleTime: 60_000,
  });
  const deliverySignatureEnabled = Boolean(settingsQuery.data?.deliverySignatureEnabled);

  const order = orderQuery.data;
  const item = useMemo(
    () => order?.items.find((i) => i.id === itemId),
    [order, itemId]
  );

  const [customParts, setCustomParts] = useState<PaymentDraft[] | null>(null);
  const [signatureSvg, setSignatureSvg] = useState<string | null>(null);
  const [signerNameDraft, setSignerNameDraft] = useState<string | null>(null);
  const [isDrawingSignature, setIsDrawingSignature] = useState(false);

  const signerNameInput = signerNameDraft ?? (order?.customerName ?? '');

  const isFreeReturn = item?.status === 'REJECTED' || (item?.totalPrice ?? 0) <= 0;
  const expectedTotal = isFreeReturn ? 0 : (item?.totalPrice ?? 0);

  const parts = useMemo<PaymentDraft[]>(() => {
    if (customParts !== null) return customParts;
    if (!item || isFreeReturn) return [];
    return [
      {
        localId: 'part-1',
        paymentMethod: 'PIX',
        amountText: formatCurrencyInput(item.totalPrice),
      },
    ];
  }, [customParts, item, isFreeReturn]);

  const enteredSum = useMemo(() => {
    const sum = parts.reduce((acc, p) => acc + parseCurrencyBRL(p.amountText), 0);
    return Math.round(sum * 100) / 100;
  }, [parts]);

  const remaining = Math.round((expectedTotal - enteredSum) * 100) / 100;
  const allPartsPositive = parts.every((p) => parseCurrencyBRL(p.amountText) > 0);
  const isBalanced = isFreeReturn || (parts.length > 0 && allPartsPositive && Math.abs(remaining) < 0.005);

  const deliverMutation = useMutation({
    mutationFn: async () => {
      const submittedPayments: ReceiptPaymentPart[] = isFreeReturn
        ? []
        : parts.map((p) => ({
            paymentMethod: p.paymentMethod,
            amount: parseCurrencyBRL(p.amountText),
          }));

      const trimmedSigner = signerNameInput.trim();
      const signaturePayload = !deliverySignatureEnabled
        ? {}
        : signatureSvg
          ? {
              deliverySignatureSvg: signatureSvg,
              deliverySignerName: trimmedSigner || undefined,
            }
          : trimmedSigner && trimmedSigner !== (order?.customerName ?? '').trim()
            ? { deliverySignerName: trimmedSigner }
            : {};

      const updatedItem = isFreeReturn
        ? await ordersApi.deliverItem(orderId, itemId, {
            ...signaturePayload,
          })
        : await ordersApi.deliverItem(orderId, itemId, {
            payments: submittedPayments.map((p) => ({
              paymentMethod: p.paymentMethod as OrderPaymentMethod,
              amount: p.amount,
            })),
            ...signaturePayload,
          });

      return { updatedItem, submittedPayments };
    },
    onSuccess: ({ updatedItem, submittedPayments }) => {
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['bench-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['stale-items'] });
      void queryClient.invalidateQueries({ queryKey: ['abandonment-eligible'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['orders-list'] });
      void queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['finance-transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['finance-daily-closing'] });
      void queryClient.invalidateQueries({ queryKey: ['orders-profitability'] });
      void queryClient.invalidateQueries({ queryKey: ['item-payments', itemId] });

      setDeliveredReceipt({
        item: updatedItem,
        payments: submittedPayments,
      });
    },
    onError: (err) => {
      Alert.alert(
        locale === 'pt-BR' ? 'Não foi possível concluir' : 'Could not complete delivery',
        err instanceof ApiError ? err.message : t.common.errorGeneric
      );
    },
  });

  const handleSendReceiptWhatsapp = async () => {
    if (!order || !deliveredReceipt || !session?.tenant) return;
    try {
      await sendConsolidatedOrderReceiptWhatsapp({
        tenant: session.tenant,
        order,
        locale,
        overrideItem: deliveredReceipt.item,
      });
    } catch (err) {
      Alert.alert(
        locale === 'pt-BR' ? 'Não foi possível abrir o WhatsApp' : 'Could not open WhatsApp',
        err instanceof Error ? err.message : t.common.errorGeneric
      );
    }
  };

  const handleShareReceiptPdf = async () => {
    if (!order || !deliveredReceipt || !session?.tenant) return;
    setSharingPdf(true);
    try {
      await shareConsolidatedOrderReceiptPdf({
        tenant: session.tenant,
        order,
        locale,
        overrideItem: deliveredReceipt.item,
        overrideItemPayments: deliveredReceipt.payments,
      });
    } catch (err) {
      Alert.alert(
        locale === 'pt-BR' ? 'Erro ao gerar comprovante' : 'Could not generate receipt',
        err instanceof Error ? err.message : t.common.errorGeneric
      );
    } finally {
      setSharingPdf(false);
    }
  };

  const handleAddSplit = () => {
    const nextMethod = PAYMENT_METHODS[parts.length % PAYMENT_METHODS.length];
    const suggested = remaining > 0 ? remaining : 0;
    setCustomParts([
      ...parts,
      {
        localId: `part-${Date.now()}-${parts.length}`,
        paymentMethod: nextMethod,
        amountText: suggested > 0 ? formatCurrencyInput(suggested) : '',
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

  if (deliveredReceipt) {
    const warranty = computeWarrantyInfo(deliveredReceipt.item);
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.replace('/(tabs)/workbench')}
            style={styles.closeBtn}
            hitSlop={8}
          >
            <X size={20} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.topTitle}>
            {locale === 'pt-BR' ? 'Entrega Confirmada' : 'Delivery Confirmed'}
          </Text>
          <TagBadge label={`#${deliveredReceipt.item.tag}`} variant="dark" />
        </View>

        <ScrollView contentContainerStyle={styles.successScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.successHero}>
            <View style={styles.successIconCircle}>
              <CheckCircle2 size={34} color={colors.successDark} strokeWidth={2.2} />
            </View>
            <Text style={styles.successTitle}>
              {isFreeReturn
                ? locale === 'pt-BR'
                  ? 'Devolução registrada!'
                  : 'Return recorded!'
                : locale === 'pt-BR'
                  ? 'Entrega registrada!'
                  : 'Delivery recorded!'}
            </Text>
            <Text style={styles.successSubtitle}>
              {isFreeReturn
                ? locale === 'pt-BR'
                  ? 'Aparelho devolvido sem cobrança. Você já pode compartilhar o comprovante de devolução com o cliente.'
                  : 'Appliance returned without charge. You can now share the return receipt with the customer.'
                : locale === 'pt-BR'
                  ? 'Pagamento confirmado e lançado no financeiro. Envie o comprovante com o termo de garantia pelo WhatsApp.'
                  : 'Payment confirmed and recorded in finance. Share the receipt and warranty certificate via WhatsApp.'}
            </Text>
          </View>

          <Card style={styles.summaryCard}>
            <Text style={styles.applianceTitle}>{applianceTitle}</Text>
            <View style={styles.customerRow}>
              <User size={14} color={colors.textMuted} />
              <Text style={styles.customerName}>{order.customerName ?? '—'}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.totalReceiveRow}>
              <Text style={styles.totalReceiveLabel}>
                {locale === 'pt-BR' ? 'TOTAL PAGO' : 'TOTAL PAID'}
              </Text>
              <Text style={styles.totalReceiveValue}>
                {formatCurrency(deliveredReceipt.item.totalPrice)}
              </Text>
            </View>

            {deliveredReceipt.payments.length > 0 ? (
              <View style={styles.receiptPaymentsList}>
                {deliveredReceipt.payments.map((part, idx) => (
                  <View key={`${part.paymentMethod}-${idx}`} style={styles.receiptPaymentRow}>
                    <Text style={styles.receiptPaymentMethod}>
                      {t.paymentMethod[part.paymentMethod]}
                    </Text>
                    <Text style={styles.receiptPaymentAmount}>{formatCurrency(part.amount)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>

          {deliveredReceipt.item.deliverySignatureSvg ? (
            <Card style={styles.signatureSummaryCard}>
              <View style={styles.signatureHeaderRow}>
                <PenTool size={15} color={colors.brandPrimary} />
                <Text style={styles.signatureSectionTitle}>
                  {locale === 'pt-BR'
                    ? 'Assinatura Digital Registrada'
                    : 'Digital Signature Captured'}
                </Text>
              </View>
              <SignaturePreview svg={deliveredReceipt.item.deliverySignatureSvg} height={74} />
              {deliveredReceipt.item.deliverySignerName ? (
                <Text style={styles.signerCaption}>
                  {locale === 'pt-BR' ? 'Retirado por: ' : 'Picked up by: '}
                  {deliveredReceipt.item.deliverySignerName}
                </Text>
              ) : null}
            </Card>
          ) : null}

          {warranty.hasWarranty && warranty.expiryDate ? (
            <Card accentBorderColor={colors.brandPrimaryBorder} style={styles.warrantySummaryCard}>
              <View style={styles.warrantySummaryHeader}>
                <ShieldCheck size={18} color={colors.brandPrimary} />
                <Text style={styles.warrantySummaryTitle}>
                  {locale === 'pt-BR'
                    ? `Garantia de ${warranty.warrantyDays} dias`
                    : `${warranty.warrantyDays}-day Warranty`}
                </Text>
              </View>
              <Text style={styles.warrantySummaryDate}>
                {locale === 'pt-BR' ? 'Válida até ' : 'Valid until '}
                <Text style={styles.warrantySummaryDateBold}>
                  {formatFullDate(warranty.expiryDate, locale)}
                </Text>
              </Text>
            </Card>
          ) : null}
        </ScrollView>

        <View
          style={[
            styles.stickyFooter,
            { paddingBottom: Math.max(insets.bottom, spacing.lg) },
          ]}
        >
          <Button
            label={
              locale === 'pt-BR'
                ? 'Enviar Comprovante no WhatsApp'
                : 'Send Receipt on WhatsApp'
            }
            icon={<MessageCircle size={18} color={colors.textOnDark} />}
            onPress={() => void handleSendReceiptWhatsapp()}
          />
          <View style={styles.successSecondaryRow}>
            <Button
              label={locale === 'pt-BR' ? 'Arquivo PDF' : 'PDF File'}
              variant="secondary"
              fullWidth={false}
              loading={sharingPdf}
              icon={<FileText size={16} color={colors.textPrimary} />}
              onPress={() => void handleShareReceiptPdf()}
              style={styles.successSecondaryBtn}
            />
            <Button
              label={locale === 'pt-BR' ? 'Bancada' : 'Workbench'}
              variant="secondary"
              fullWidth={false}
              onPress={() => router.replace('/(tabs)/workbench')}
              style={styles.successSecondaryBtn}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
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
          scrollEnabled={!isDrawingSignature}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
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
                const parsedValue = parseCurrencyBRL(part.amountText);
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
                          onChangeText={(val) =>
                            updatePart(part.localId, { amountText: maskCurrencyBRL(val) })
                          }
                          placeholder="0,00"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="number-pad"
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
          {/* Digital Pickup Signature Card (controlled by shop settings) */}
          {deliverySignatureEnabled ? (
            <Card style={styles.signatureCard}>
              <View style={styles.signatureHeaderRow}>
                <PenTool size={15} color={colors.brandPrimary} />
                <Text style={styles.signatureSectionTitle}>
                  {locale === 'pt-BR'
                    ? 'Assinatura na Retirada (Opcional)'
                    : 'Pickup Signature (Optional)'}
                </Text>
              </View>

              <View style={styles.amountGroup}>
                <Text style={styles.amountLabel}>
                  {locale === 'pt-BR' ? 'Retirado por' : 'Picked up by'}
                </Text>
                <TextInput
                  value={signerNameInput}
                  onChangeText={setSignerNameDraft}
                  placeholder={
                    locale === 'pt-BR'
                      ? 'Nome de quem está retirando'
                      : 'Name of person picking up'
                  }
                  placeholderTextColor={colors.textMuted}
                  maxLength={120}
                  style={styles.signerInput}
                />
              </View>

              <SignaturePad
                locale={locale}
                onChange={setSignatureSvg}
                onDrawingChange={setIsDrawingSignature}
              />
            </Card>
          ) : null}
        </ScrollView>

        {/* Sticky Bottom CTA */}
        <View
          style={[
            styles.stickyFooter,
            { paddingBottom: isKeyboardVisible ? spacing.md : Math.max(insets.bottom, spacing.lg) },
          ]}
        >
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
  successScroll: {
    padding: spacing.lg,
    gap: 14,
  },
  successHero: {
    alignItems: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  successTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 20,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  successSubtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
  },
  receiptPaymentsList: {
    gap: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  receiptPaymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  receiptPaymentMethod: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  receiptPaymentAmount: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  warrantySummaryCard: {
    backgroundColor: colors.brandPrimarySoft,
    gap: 6,
  },
  warrantySummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  warrantySummaryTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 15,
    color: colors.infoDark,
  },
  warrantySummaryDate: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13.5,
    color: colors.textSecondary,
  },
  warrantySummaryDateBold: {
    fontFamily: fonts.monoBold,
    color: colors.infoDark,
  },
  successSecondaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  successSecondaryBtn: {
    flex: 1,
  },
  signatureCard: {
    gap: 10,
  },
  signatureSummaryCard: {
    gap: 8,
  },
  signatureHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  signatureSectionTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 13.5,
    color: colors.textPrimary,
  },
  signerInput: {
    height: 44,
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    fontFamily: fonts.bodyMedium,
    fontSize: 13.5,
    color: colors.textPrimary,
  },
  signerCaption: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
