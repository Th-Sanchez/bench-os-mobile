import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ExternalLink,
  PackageCheck,
  Pencil,
  Plus,
  RotateCcw,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react-native';
import { partRequestsApi, partsCatalogApi } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type {
  ItemStatus,
  OrderPaymentMethod,
  PartCatalogResponse,
  PartRequestResponse,
  PartRequestStatus,
  ServiceOrderItemResponse,
} from '@/types/api';
import {
  formatCurrencyInput,
  maskCurrencyBRL,
  maskInteger,
  parseCurrencyBRL,
} from '@/utils/masks';

const PAYMENT_METHODS: OrderPaymentMethod[] = ['PIX', 'DEBIT_CARD', 'CREDIT_CARD', 'CASH'];

export function PartRequestStatusPill({
  status,
  locale,
}: {
  status: PartRequestStatus;
  locale: 'pt-BR' | 'en';
}) {
  const palette =
    status === 'TO_ORDER'
      ? { bg: colors.warningSoft, border: colors.warningBorder, text: colors.warningDark }
      : status === 'ORDERED'
        ? { bg: colors.infoSoft, border: colors.infoBorder, text: colors.infoDark }
        : status === 'ARRIVED'
          ? { bg: colors.successSoft, border: colors.successBorder, text: colors.successDark }
          : { bg: colors.neutralSoft, border: colors.neutralBorder, text: colors.textMuted };

  const label =
    locale === 'pt-BR'
      ? status === 'TO_ORDER'
        ? 'A pedir'
        : status === 'ORDERED'
          ? 'Pedido feito'
          : status === 'ARRIVED'
            ? 'Chegou'
            : 'Cancelado'
      : status === 'TO_ORDER'
        ? 'To order'
        : status === 'ORDERED'
          ? 'Ordered'
          : status === 'ARRIVED'
            ? 'Arrived'
            : 'Cancelled';

  return (
    <View style={[styles.statusPill, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[styles.statusPillText, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

interface PartRequestFormModalProps {
  visible: boolean;
  onClose: () => void;
  orderId: string;
  itemId: string;
  itemStatus?: ItemStatus;
  applianceType?: string;
  editing?: PartRequestResponse | null;
}

export function PartRequestFormMobileModal(props: PartRequestFormModalProps) {
  return (
    <Modal visible={props.visible} animationType="slide" transparent onRequestClose={props.onClose}>
      {props.visible ? (
        <PartRequestFormMobileModalContent key={props.editing?.id ?? 'new'} {...props} />
      ) : null}
    </Modal>
  );
}

function PartRequestFormMobileModalContent({
  visible,
  onClose,
  orderId,
  itemId,
  itemStatus,
  applianceType,
  editing,
}: PartRequestFormModalProps) {
  const { locale, t, formatCurrency } = useI18n();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardVisible();

  const [partCatalogId, setPartCatalogId] = useState<string | null>(
    () => editing?.partCatalogId ?? null
  );
  const [partName, setPartName] = useState(() => editing?.partName ?? '');
  const [quantity, setQuantity] = useState(() => (editing ? String(editing.quantity) : '1'));
  const [estimatedCostInput, setEstimatedCostInput] = useState(() =>
    editing ? formatCurrencyInput(editing.estimatedUnitCost) : ''
  );
  const [actualCostInput, setActualCostInput] = useState(() =>
    editing?.actualUnitCost != null ? formatCurrencyInput(editing.actualUnitCost) : ''
  );
  const [supplierName, setSupplierName] = useState(() => editing?.supplierName ?? '');
  const [purchaseUrl, setPurchaseUrl] = useState(() => editing?.purchaseUrl ?? '');
  const [notes, setNotes] = useState(() => editing?.notes ?? '');
  const [moveToWaitingParts, setMoveToWaitingParts] = useState(
    () => !editing && (itemStatus === 'APPROVED' || itemStatus === 'IN_REPAIR')
  );

  const canMoveToWaiting =
    !editing && (itemStatus === 'APPROVED' || itemStatus === 'IN_REPAIR');

  const catalogQuery = useQuery({
    queryKey: ['parts-catalog', '', ''],
    queryFn: () => partsCatalogApi.list(),
    enabled: visible && !editing,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const qty = Math.max(1, Math.min(999, Number.parseInt(quantity, 10) || 1));
      const estCost = parseCurrencyBRL(estimatedCostInput);
      const actCost = actualCostInput.trim() ? parseCurrencyBRL(actualCostInput) : undefined;
      if (editing) {
        return partRequestsApi.update(editing.id, {
          partName: partName.trim(),
          quantity: qty,
          estimatedUnitCost: estCost,
          actualUnitCost: actCost,
          supplierName: supplierName.trim() || undefined,
          purchaseUrl: purchaseUrl.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      }
      return partRequestsApi.createForItem(orderId, itemId, {
        partCatalogId: partCatalogId ?? undefined,
        partName: partName.trim() || undefined,
        quantity: qty,
        estimatedUnitCost: estCost,
        supplierName: supplierName.trim() || undefined,
        purchaseUrl: purchaseUrl.trim() || undefined,
        notes: notes.trim() || undefined,
        moveItemToWaitingParts: canMoveToWaiting ? moveToWaitingParts : false,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['item-part-requests', orderId, itemId] }),
        queryClient.invalidateQueries({ queryKey: ['part-requests-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['part-requests-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['order', orderId] }),
        queryClient.invalidateQueries({ queryKey: ['bench-queue'] }),
      ]);
      onClose();
    },
    onError: (err) => {
      Alert.alert(
        locale === 'pt-BR' ? 'Erro ao salvar peça' : 'Could not save part',
        err instanceof ApiError ? err.message : t.common.errorGeneric
      );
    },
  });

  const sortedCatalog = [...(catalogQuery.data ?? [])].sort((a, b) => {
    if (applianceType) {
      const aMatch = a.applianceCategory?.toLowerCase().includes(applianceType.toLowerCase()) ? 0 : 1;
      const bMatch = b.applianceCategory?.toLowerCase().includes(applianceType.toLowerCase()) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
    }
    return a.name.localeCompare(b.name);
  });

  const selectCatalogPart = (part: PartCatalogResponse) => {
    setPartCatalogId(part.id);
    setPartName(part.name);
    setEstimatedCostInput(formatCurrencyInput(part.averageCost));
  };

  return (
      <KeyboardAvoidingView
        style={[
          styles.modalBackdrop,
          { paddingTop: Math.max(insets.top + spacing.sm, spacing.lg) },
        ]}
        behavior="padding"
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={locale === 'pt-BR' ? 'Fechar' : 'Close'}
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editing
                ? locale === 'pt-BR'
                  ? 'Editar Pedido de Peça'
                  : 'Edit Part Request'
                : locale === 'pt-BR'
                  ? 'Pedir Peça para a OS'
                  : 'Request Part'}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalBody}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
          >
            {!editing && sortedCatalog.length > 0 ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>
                  {locale === 'pt-BR' ? 'Sugestões do catálogo' : 'Catalog quick-pick'}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catalogRow}>
                  {sortedCatalog.slice(0, 12).map((part) => {
                    const selected = partCatalogId === part.id;
                    return (
                      <Pressable
                        key={part.id}
                        onPress={() => selectCatalogPart(part)}
                        style={[styles.catalogChip, selected && styles.catalogChipActive]}
                      >
                        <Text
                          style={[styles.catalogChipTitle, selected && styles.catalogChipTitleActive]}
                          numberOfLines={1}
                        >
                          {part.name}
                        </Text>
                        <Text
                          style={[styles.catalogChipCost, selected && styles.catalogChipCostActive]}
                        >
                          {formatCurrency(part.averageCost)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>
                {locale === 'pt-BR' ? 'Nome da peça *' : 'Part name *'}
              </Text>
              <TextInput
                value={partName}
                onChangeText={setPartName}
                placeholder="Ex.: Magnetron 2M219J, Termostato..."
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>

            <View style={styles.rowTwo}>
              <View style={[styles.fieldBlock, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>
                  {locale === 'pt-BR' ? 'Quantidade' : 'Quantity'}
                </Text>
                <TextInput
                  value={quantity}
                  onChangeText={(v) => setQuantity(maskInteger(v, 3))}
                  keyboardType="number-pad"
                  placeholder="1"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, styles.monoInput]}
                />
              </View>
              <View style={[styles.fieldBlock, { flex: 1.4 }]}>
                <Text style={styles.fieldLabel}>
                  {locale === 'pt-BR' ? 'Custo est. unit. (R$)' : 'Est. unit cost (R$)'}
                </Text>
                <TextInput
                  value={estimatedCostInput}
                  onChangeText={(v) => setEstimatedCostInput(maskCurrencyBRL(v))}
                  keyboardType="number-pad"
                  placeholder="0,00"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, styles.monoInput]}
                />
              </View>
            </View>

            {editing ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>
                  {locale === 'pt-BR' ? 'Custo real unit. (R$)' : 'Actual unit cost (R$)'}
                </Text>
                <TextInput
                  value={actualCostInput}
                  onChangeText={(v) => setActualCostInput(maskCurrencyBRL(v))}
                  keyboardType="number-pad"
                  placeholder="0,00"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, styles.monoInput]}
                />
              </View>
            ) : null}

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>
                {locale === 'pt-BR' ? 'Fornecedor (opcional)' : 'Supplier (optional)'}
              </Text>
              <TextInput
                value={supplierName}
                onChangeText={setSupplierName}
                placeholder="Ex.: Mercado Livre, Distribuidora..."
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>
                {locale === 'pt-BR' ? 'Link de compra (opcional)' : 'Purchase URL (optional)'}
              </Text>
              <TextInput
                value={purchaseUrl}
                onChangeText={setPurchaseUrl}
                placeholder="https://..."
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={styles.input}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>
                {locale === 'pt-BR' ? 'Observações (opcional)' : 'Notes (optional)'}
              </Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder={
                  locale === 'pt-BR' ? 'Conector, código, referência...' : 'Part code, connector...'
                }
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>

            {canMoveToWaiting ? (
              <View style={styles.switchBox}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>
                    {locale === 'pt-BR'
                      ? 'Mover item para "Aguardando Peça"'
                      : 'Move item to "Waiting Parts"'}
                  </Text>
                  <Text style={styles.switchSubtitle}>
                    {locale === 'pt-BR'
                      ? 'Atualiza o status do aparelho na bancada automaticamente.'
                      : 'Automatically updates item status on the workbench.'}
                  </Text>
                </View>
                <Switch
                  value={moveToWaitingParts}
                  onValueChange={setMoveToWaitingParts}
                  trackColor={{ false: colors.borderStrong, true: colors.brandPrimary }}
                />
              </View>
            ) : null}
          </ScrollView>

          <View
            style={[
              styles.modalFooter,
              {
                paddingBottom: isKeyboardVisible
                  ? spacing.md
                  : Math.max(insets.bottom + spacing.md, spacing.xl),
              },
            ]}
          >
            <Button
              label={t.common.cancel}
              variant="secondary"
              onPress={onClose}
              style={{ flex: 1 }}
            />
            <Button
              label={
                editing
                  ? t.common.save
                  : locale === 'pt-BR'
                    ? 'Adicionar à Fila'
                    : 'Add to Queue'
              }
              variant="primary"
              loading={saveMutation.isPending}
              disabled={!partName.trim() && !partCatalogId}
              onPress={() => saveMutation.mutate()}
              style={{ flex: 1.4 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
  );
}

interface ArrivePartModalProps {
  request: PartRequestResponse | null;
  onClose: () => void;
}

export function ArrivePartRequestMobileModal({ request, onClose }: ArrivePartModalProps) {
  return (
    <Modal visible={Boolean(request)} animationType="slide" transparent onRequestClose={onClose}>
      {request ? (
        <ArrivePartRequestMobileModalContent key={request.id} request={request} onClose={onClose} />
      ) : null}
    </Modal>
  );
}

function ArrivePartRequestMobileModalContent({
  request,
  onClose,
}: {
  request: PartRequestResponse;
  onClose: () => void;
}) {
  const { locale, t, formatCurrency } = useI18n();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardVisible();
  const isOwner = session?.user.role === 'OWNER';

  const baseUnit = request.actualUnitCost ?? request.estimatedUnitCost;
  const [actualUnitCostInput, setActualUnitCostInput] = useState(() =>
    formatCurrencyInput(baseUnit)
  );
  const [addToItemPartsCost, setAddToItemPartsCost] = useState(true);
  const [moveItemToInRepair, setMoveItemToInRepair] = useState(
    () => request.itemStatus === 'WAITING_PARTS'
  );
  const [recordExpense, setRecordExpense] = useState(
    () => isOwner && baseUnit * request.quantity > 0
  );
  const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>('PIX');

  const arriveMutation = useMutation({
    mutationFn: () => {
      const unitCost = parseCurrencyBRL(actualUnitCostInput);
      const total = unitCost * request.quantity;
      return partRequestsApi.markArrived(request.id, {
        actualUnitCost: unitCost,
        addToItemPartsCost,
        moveItemToInRepair,
        recordExpense: isOwner && recordExpense && total > 0,
        paymentMethod: isOwner && recordExpense && total > 0 ? paymentMethod : undefined,
      });
    },
    onSuccess: async (updated) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['item-part-requests', updated.serviceOrderId, updated.serviceOrderItemId],
        }),
        queryClient.invalidateQueries({ queryKey: ['part-requests-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['part-requests-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['order', updated.serviceOrderId] }),
        queryClient.invalidateQueries({ queryKey: ['bench-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['finance'] }),
      ]);
      onClose();
    },
    onError: (err) => {
      Alert.alert(
        locale === 'pt-BR' ? 'Erro ao dar baixa' : 'Could not confirm arrival',
        err instanceof ApiError ? err.message : t.common.errorGeneric
      );
    },
  });

  const unitCostNum = parseCurrencyBRL(actualUnitCostInput);
  const totalCostNum = unitCostNum * request.quantity;

  return (
      <KeyboardAvoidingView
        style={[
          styles.modalBackdrop,
          { paddingTop: Math.max(insets.top + spacing.sm, spacing.lg) },
        ]}
        behavior="padding"
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={locale === 'pt-BR' ? 'Fechar' : 'Close'}
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {locale === 'pt-BR' ? 'Dar Baixa — Peça Chegou' : 'Confirm Part Arrival'}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {request ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalBody}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets
            >
              <View style={styles.summaryStrip}>
                <Text style={styles.summaryPartName}>
                  {request.quantity > 1 ? `${request.quantity}x ` : ''}
                  {request.partName}
                </Text>
                <Text style={styles.summarySub}>
                  #{request.itemTag} · {request.applianceDisplayName}
                </Text>
              </View>

              <View style={styles.rowTwo}>
                <View style={[styles.fieldBlock, { flex: 1.2 }]}>
                  <Text style={styles.fieldLabel}>
                    {locale === 'pt-BR' ? 'Custo real unit. (R$)' : 'Actual unit cost (R$)'}
                  </Text>
                  <TextInput
                    value={actualUnitCostInput}
                    onChangeText={(v) => setActualUnitCostInput(maskCurrencyBRL(v))}
                    keyboardType="number-pad"
                    placeholder="0,00"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.input, styles.monoInput]}
                  />
                </View>
                <View style={styles.totalPreviewBox}>
                  <Text style={styles.totalPreviewLabel}>
                    {locale === 'pt-BR' ? `Total (${request.quantity}x)` : `Total (${request.quantity}x)`}
                  </Text>
                  <Text style={styles.totalPreviewValue}>{formatCurrency(totalCostNum)}</Text>
                </View>
              </View>

              <View style={styles.switchBox}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>
                    {locale === 'pt-BR'
                      ? 'Somar no custo real da OS'
                      : 'Add to item actual parts cost'}
                  </Text>
                  <Text style={styles.switchSubtitle}>
                    {locale === 'pt-BR'
                      ? 'Atualiza o cálculo de margem real do reparo.'
                      : 'Updates internal real net profit.'}
                  </Text>
                </View>
                <Switch
                  value={addToItemPartsCost}
                  onValueChange={setAddToItemPartsCost}
                  trackColor={{ false: colors.borderStrong, true: colors.brandPrimary }}
                />
              </View>

              {request.itemStatus === 'WAITING_PARTS' ? (
                <View style={styles.switchBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchTitle}>
                      {locale === 'pt-BR'
                        ? 'Mover item para "Em Reparo"'
                        : 'Move item to "In Repair"'}
                    </Text>
                    <Text style={styles.switchSubtitle}>
                      {locale === 'pt-BR'
                        ? 'Se for a última peça pendente deste item.'
                        : 'When no other pending parts remain.'}
                    </Text>
                  </View>
                  <Switch
                    value={moveItemToInRepair}
                    onValueChange={setMoveItemToInRepair}
                    trackColor={{ false: colors.borderStrong, true: colors.brandPrimary }}
                  />
                </View>
              ) : null}

              {isOwner && totalCostNum > 0 ? (
                <View style={[styles.switchBox, { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm }]}>
                  <View style={styles.switchTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.switchTitle}>
                        {locale === 'pt-BR'
                          ? 'Lançar despesa no Financeiro'
                          : 'Record Finance expense'}
                      </Text>
                      <Text style={styles.switchSubtitle}>
                        {locale === 'pt-BR'
                          ? `Compra de Peças · ${formatCurrency(totalCostNum)}`
                          : `Parts Purchase · ${formatCurrency(totalCostNum)}`}
                      </Text>
                    </View>
                    <Switch
                      value={recordExpense}
                      onValueChange={setRecordExpense}
                      trackColor={{ false: colors.borderStrong, true: colors.success }}
                    />
                  </View>

                  {recordExpense ? (
                    <View style={styles.pmRow}>
                      {PAYMENT_METHODS.map((pm) => {
                        const active = paymentMethod === pm;
                        return (
                          <Pressable
                            key={pm}
                            onPress={() => setPaymentMethod(pm)}
                            style={[styles.pmChip, active && styles.pmChipActive]}
                          >
                            <Text style={[styles.pmChipText, active && styles.pmChipTextActive]}>
                              {t.paymentMethod[pm]}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>
          ) : null}

          <View
            style={[
              styles.modalFooter,
              {
                paddingBottom: isKeyboardVisible
                  ? spacing.md
                  : Math.max(insets.bottom + spacing.md, spacing.xl),
              },
            ]}
          >
            <Button
              label={t.common.cancel}
              variant="secondary"
              onPress={onClose}
              style={{ flex: 1 }}
            />
            <Button
              label={locale === 'pt-BR' ? 'Confirmar Chegada' : 'Confirm Arrival'}
              variant="primary"
              loading={arriveMutation.isPending}
              onPress={() => arriveMutation.mutate()}
              style={{ flex: 1.5 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
  );
}

interface ItemPartRequestsSectionProps {
  orderId: string;
  item: ServiceOrderItemResponse;
}

export function ItemPartRequestsSection({ orderId, item }: ItemPartRequestsSectionProps) {
  const router = useRouter();
  const { locale, t, formatCurrency } = useI18n();
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const canWrite = session?.user.role === 'OWNER' || session?.user.role === 'TECHNICIAN';
  const isPreApproval =
    item.status === 'RECEIVED' || item.status === 'DIAGNOSING' || item.status === 'QUOTE_SENT';
  const isTerminal =
    item.status === 'REJECTED' ||
    item.status === 'DELIVERED' ||
    item.status === 'DISCARDED' ||
    item.status === 'CANCELLED';

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PartRequestResponse | null>(null);
  const [arriving, setArriving] = useState<PartRequestResponse | null>(null);

  const requestsQuery = useQuery({
    queryKey: ['item-part-requests', orderId, item.id],
    queryFn: () => partRequestsApi.listForItem(orderId, item.id),
    enabled: !isPreApproval,
  });

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['item-part-requests', orderId, item.id] }),
      queryClient.invalidateQueries({ queryKey: ['part-requests-queue'] }),
      queryClient.invalidateQueries({ queryKey: ['part-requests-summary'] }),
    ]);

  const markOrderedMutation = useMutation({
    mutationFn: (id: string) => partRequestsApi.markOrdered(id),
    onSuccess: () => void invalidate(),
    onError: (err) => {
      Alert.alert(
        locale === 'pt-BR' ? 'Erro' : 'Error',
        err instanceof ApiError ? err.message : t.common.errorGeneric
      );
    },
  });

  const reopenMutation = useMutation({
    mutationFn: (id: string) => partRequestsApi.reopen(id),
    onSuccess: () => void invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => partRequestsApi.remove(id),
    onSuccess: () => void invalidate(),
  });

  const confirmDelete = (req: PartRequestResponse) => {
    Alert.alert(
      locale === 'pt-BR' ? 'Remover pedido?' : 'Remove part request?',
      `"${req.partName}"`,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: locale === 'pt-BR' ? 'Remover' : 'Remove',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(req.id),
        },
      ]
    );
  };

  const list = requestsQuery.data ?? [];
  const pendingCount = list.filter((r) => r.status === 'TO_ORDER' || r.status === 'ORDERED').length;

  if (isPreApproval || (isTerminal && !requestsQuery.isLoading && list.length === 0)) {
    return null;
  }

  return (
    <>
      <Card style={styles.sectionCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <ShoppingCart size={16} color={colors.warning} />
            <Text style={styles.sectionTitle}>
              {locale === 'pt-BR' ? 'Peças Necessárias' : 'Required Parts'}
            </Text>
            {pendingCount > 0 ? (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{pendingCount}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.headerRight}>
            <Pressable onPress={() => router.push('/orders/part-requests' as Href)} hitSlop={8}>
              <Text style={styles.queueLink}>
                {locale === 'pt-BR' ? 'Fila' : 'Queue'}
              </Text>
            </Pressable>
            {canWrite && !isTerminal ? (
              <Pressable
                onPress={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
                style={styles.addBtn}
              >
                <Plus size={13} color={colors.brandPrimary} />
                <Text style={styles.addBtnText}>
                  {locale === 'pt-BR' ? 'Pedir' : 'Request'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {requestsQuery.isLoading ? (
          <ActivityIndicator size="small" color={colors.brandPrimary} />
        ) : list.length === 0 ? (
          <Text style={styles.emptyText}>
            {locale === 'pt-BR'
              ? 'Nenhuma peça solicitada para este aparelho.'
              : 'No parts requested for this item.'}
          </Text>
        ) : (
          <View style={styles.listGap}>
            {list.map((req) => {
              const isPending = req.status === 'TO_ORDER' || req.status === 'ORDERED';
              return (
                <View key={req.id} style={styles.reqBox}>
                  <View style={styles.reqTop}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={styles.reqTitleRow}>
                        <Text style={styles.reqName}>
                          {req.quantity > 1 ? `${req.quantity}x ` : ''}
                          {req.partName}
                        </Text>
                        <PartRequestStatusPill status={req.status} locale={locale} />
                      </View>
                      {req.supplierName ? (
                        <Text style={styles.reqMeta}>{req.supplierName}</Text>
                      ) : null}
                      {req.purchaseUrl ? (
                        <Pressable
                          onPress={() => void Linking.openURL(req.purchaseUrl!)}
                          style={styles.linkRow}
                        >
                          <ExternalLink size={12} color={colors.brandPrimary} />
                          <Text style={styles.linkText}>
                            {locale === 'pt-BR' ? 'Abrir link de compra' : 'Open purchase link'}
                          </Text>
                        </Pressable>
                      ) : null}
                      {req.notes ? <Text style={styles.reqNotes}>{req.notes}</Text> : null}
                    </View>
                    <Text style={styles.reqCost}>{formatCurrency(req.effectiveTotalCost)}</Text>
                  </View>

                  {canWrite && isPending ? (
                    <View style={styles.reqActions}>
                      {req.status === 'TO_ORDER' ? (
                        <Pressable
                          onPress={() => markOrderedMutation.mutate(req.id)}
                          style={styles.actionOutlineBtn}
                        >
                          <ShoppingCart size={13} color={colors.infoDark} />
                          <Text style={styles.actionOutlineText}>
                            {locale === 'pt-BR' ? 'Pedido feito' : 'Ordered'}
                          </Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          onPress={() => reopenMutation.mutate(req.id)}
                          style={styles.actionGhostBtn}
                        >
                          <RotateCcw size={13} color={colors.textSecondary} />
                          <Text style={styles.actionGhostText}>
                            {locale === 'pt-BR' ? 'A pedir' : 'Reopen'}
                          </Text>
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => setArriving(req)}
                        style={styles.actionSuccessBtn}
                      >
                        <PackageCheck size={13} color={colors.textOnDark} />
                        <Text style={styles.actionSuccessText}>
                          {locale === 'pt-BR' ? 'Chegou' : 'Arrived'}
                        </Text>
                      </Pressable>
                      <View style={{ flex: 1 }} />
                      <Pressable
                        onPress={() => {
                          setEditing(req);
                          setFormOpen(true);
                        }}
                        hitSlop={8}
                        style={styles.iconAction}
                      >
                        <Pencil size={15} color={colors.textSecondary} />
                      </Pressable>
                      <Pressable
                        onPress={() => confirmDelete(req)}
                        hitSlop={8}
                        style={styles.iconAction}
                      >
                        <Trash2 size={15} color={colors.danger} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </Card>

      <PartRequestFormMobileModal
        visible={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        orderId={orderId}
        itemId={item.id}
        itemStatus={item.status}
        applianceType={item.applianceType}
        editing={editing}
      />

      <ArrivePartRequestMobileModal
        request={arriving}
        onClose={() => setArriving(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  countBadge: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  countBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.warningDark,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  queueLink: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.brandPrimary,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brandPrimarySoft,
    borderColor: colors.brandPrimaryBorder,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  addBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.brandPrimary,
  },
  emptyText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textMuted,
  },
  listGap: {
    gap: spacing.sm,
  },
  reqBox: {
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  reqTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  reqTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  reqName: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  reqMeta: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  reqNotes: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textMuted,
  },
  reqCost: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  linkText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.brandPrimary,
  },
  reqActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.sm,
  },
  actionOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.infoSoft,
    borderColor: colors.infoBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionOutlineText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.infoDark,
  },
  actionGhostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.bgSurface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionGhostText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  actionSuccessBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionSuccessText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.textOnDark,
  },
  iconAction: {
    padding: 4,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusPillText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.bgSurface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '92%',
    flexShrink: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  modalTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  modalBody: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  fieldBlock: {
    gap: 6,
  },
  fieldLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.textSecondary,
  },
  input: {
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  monoInput: {
    fontFamily: fonts.monoMedium,
  },
  rowTwo: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-end',
  },
  catalogRow: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  catalogChip: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgCanvas,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    maxWidth: 170,
  },
  catalogChipActive: {
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandPrimarySoft,
  },
  catalogChipTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.textPrimary,
  },
  catalogChipTitleActive: {
    color: colors.brandPrimary,
  },
  catalogChipCost: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: colors.textMuted,
  },
  catalogChipCostActive: {
    color: colors.infoDark,
  },
  switchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  switchTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  switchTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  switchSubtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  summaryStrip: {
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 2,
  },
  summaryPartName: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  summarySub: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  totalPreviewBox: {
    flex: 1,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    alignItems: 'flex-end',
  },
  totalPreviewLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: colors.successDark,
  },
  totalPreviewValue: {
    fontFamily: fonts.monoBold,
    fontSize: 15,
    color: colors.successDark,
  },
  pmRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pmChip: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pmChipActive: {
    borderColor: colors.success,
    backgroundColor: colors.success,
  },
  pmChipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.textPrimary,
  },
  pmChipTextActive: {
    color: colors.textOnDark,
  },
});
