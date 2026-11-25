import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, Sparkles, TrendingUp, X } from 'lucide-react-native';
import { ordersApi, partsCatalogApi, tenantSettingsApi } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { PartsCatalogModal } from '@/components/settings/PartsCatalogModal';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { PartCatalogResponse, ServiceOrderItemResponse } from '@/types/api';
import {
  formatCurrencyInput,
  maskCurrencyBRL,
  maskInteger,
  parseCurrencyBRL,
} from '@/utils/masks';

function normalizeCategoryToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const UNIVERSAL_TOKENS = new Set(['geral', 'universal', 'todos', 'all']);

function classifyPartForAppliance(
  part: PartCatalogResponse,
  applianceType: string
): 'exact' | 'universal' | 'other' {
  const raw = (part.applianceCategory ?? '').trim();
  if (!raw) return 'universal';

  const target = normalizeCategoryToken(applianceType);
  const tokens = raw
    .split(/[,;]/)
    .map(normalizeCategoryToken)
    .filter((token) => token.length > 0);

  if (tokens.length === 0) return 'universal';
  if (target && tokens.includes(target)) return 'exact';
  if (tokens.some((token) => UNIVERSAL_TOKENS.has(token))) return 'universal';
  return 'other';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removePartFromDiagnosis(currentText: string, partName: string, prefix: string): string {
  const trimmed = currentText.trim();
  if (!trimmed) return '';

  const escapedName = escapeRegExp(partName.trim());
  const escapedPrefix = escapeRegExp(prefix);

  // Exact "Troca de <Part>"
  if (new RegExp(`^${escapedPrefix}\\s+${escapedName}$`, 'i').test(trimmed)) {
    return '';
  }

  // Starts with "Troca de <Part> + <Rest>" -> "Troca de <Rest>"
  const leadingWithPrefix = new RegExp(`^${escapedPrefix}\\s+${escapedName}\\s*\\+\\s*`, 'i');
  if (leadingWithPrefix.test(trimmed)) {
    return trimmed.replace(leadingWithPrefix, `${prefix} `).trim();
  }

  // Appended "... + <Part>" (middle or end)
  const appended = new RegExp(`\\s*\\+\\s*${escapedName}(?=\\s*\\+|$)`, 'i');
  if (appended.test(trimmed)) {
    return trimmed.replace(appended, '').trim();
  }

  // Starts with "<Part> + <Rest>"
  const leadingPlain = new RegExp(`^${escapedName}\\s*\\+\\s*`, 'i');
  if (leadingPlain.test(trimmed)) {
    return trimmed.replace(leadingPlain, '').trim();
  }

  // Exact "<Part>"
  if (new RegExp(`^${escapedName}$`, 'i').test(trimmed)) {
    return '';
  }

  return currentText;
}

interface QuoteEditModalProps {
  visible: boolean;
  orderId: string;
  item: ServiceOrderItemResponse;
  onClose: () => void;
}

export function QuoteEditModal({ visible, orderId, item, onClose }: QuoteEditModalProps) {
  const settingsQuery = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.get(),
    enabled: visible,
  });

  const defaultLaborCost = Number(settingsQuery.data?.defaultLaborCost ?? 0);
  const initialLabor = item.laborCost > 0 ? item.laborCost : defaultLaborCost;
  const settingsReady = settingsQuery.isSuccess || settingsQuery.isError;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {visible ? (
        <QuoteEditBody
          key={`${item.id}-${item.updatedAt}-${settingsReady ? defaultLaborCost : 'pending'}`}
          orderId={orderId}
          item={item}
          initialLabor={initialLabor}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}

function QuoteEditBody({
  orderId,
  item,
  initialLabor,
  onClose,
}: Omit<QuoteEditModalProps, 'visible'> & { initialLabor: number }) {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardVisible();
  const { locale, formatCurrency } = useI18n();

  const [diagnosis, setDiagnosis] = useState(item.technicalDiagnosis ?? '');
  const [laborInput, setLaborInput] = useState(formatCurrencyInput(initialLabor));
  const [partsInput, setPartsInput] = useState(formatCurrencyInput(item.partsCost));
  const [partsActualInput, setPartsActualInput] = useState(
    formatCurrencyInput(item.partsCostActual ?? 0)
  );
  const [discountInput, setDiscountInput] = useState(formatCurrencyInput(item.discount));
  const [warrantyInput, setWarrantyInput] = useState(
    item.warrantyDays > 0 ? String(item.warrantyDays) : ''
  );
  const [appliedParts, setAppliedParts] = useState<PartCatalogResponse[]>([]);
  const [showAllParts, setShowAllParts] = useState(false);
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const catalogQuery = useQuery({
    queryKey: ['parts-catalog'],
    queryFn: () => partsCatalogApi.list(),
  });

  const seedMutation = useMutation({
    mutationFn: () => partsCatalogApi.seedDefaults(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['parts-catalog'] });
    },
  });

  const { matchingParts, allPartsSorted } = useMemo(() => {
    const list = catalogQuery.data ?? [];
    const rank = (kind: 'exact' | 'universal' | 'other') =>
      kind === 'exact' ? 0 : kind === 'universal' ? 1 : 2;

    const annotated = list.map((part) => ({
      part,
      kind: classifyPartForAppliance(part, item.applianceType),
    }));

    annotated.sort((a, b) => {
      const diff = rank(a.kind) - rank(b.kind);
      if (diff !== 0) return diff;
      return a.part.name.localeCompare(b.part.name);
    });

    return {
      matchingParts: annotated
        .filter((entry) => entry.kind !== 'other')
        .map((entry) => entry.part),
      allPartsSorted: annotated.map((entry) => entry.part),
    };
  }, [catalogQuery.data, item.applianceType]);

  const displayedParts = showAllParts ? allPartsSorted : matchingParts;
  const hiddenOtherCount = Math.max(0, allPartsSorted.length - matchingParts.length);

  const labor = parseCurrencyBRL(laborInput);
  const parts = parseCurrencyBRL(partsInput);
  const partsActual = parseCurrencyBRL(partsActualInput);
  const discount = parseCurrencyBRL(discountInput);
  const computedTotal = Math.round((labor + parts - discount) * 100) / 100;
  const estimatedNetProfit = Math.round((computedTotal - partsActual) * 100) / 100;
  const marginPct =
    computedTotal > 0 ? Math.round((estimatedNetProfit / computedTotal) * 100) : 0;

  const diagnosisPrefix = locale === 'pt-BR' ? 'Troca de' : 'Replace';

  const handleApplyPart = (part: PartCatalogResponse) => {
    const nextPartsPrice = Math.max(0, Math.round((parts + Number(part.suggestedPrice)) * 100) / 100);
    const nextPartsCost = Math.max(0, Math.round((partsActual + Number(part.averageCost)) * 100) / 100);

    setPartsInput(formatCurrencyInput(nextPartsPrice));
    setPartsActualInput(formatCurrencyInput(nextPartsCost));
    setAppliedParts((prev) => [...prev, part]);

    // Append part name to technical diagnosis if not already mentioned
    setDiagnosis((prev) => {
      const trimmed = prev.trim();
      if (trimmed.toLowerCase().includes(part.name.toLowerCase())) {
        return prev;
      }
      return trimmed ? `${trimmed} + ${part.name}` : `${diagnosisPrefix} ${part.name}`;
    });
  };

  const handleRemoveAppliedPart = (indexToRemove: number) => {
    const removed = appliedParts[indexToRemove];
    if (!removed) return;
    const nextApplied = appliedParts.filter((_, idx) => idx !== indexToRemove);
    const nextPartsPrice = Math.max(0, Math.round((parts - Number(removed.suggestedPrice)) * 100) / 100);
    const nextPartsCost = Math.max(0, Math.round((partsActual - Number(removed.averageCost)) * 100) / 100);
    setPartsInput(formatCurrencyInput(nextPartsPrice));
    setPartsActualInput(formatCurrencyInput(nextPartsCost));
    setAppliedParts(nextApplied);

    const stillHasSamePart = nextApplied.some(
      (part) => part.name.trim().toLowerCase() === removed.name.trim().toLowerCase()
    );
    if (!stillHasSamePart) {
      setDiagnosis((prev) => removePartFromDiagnosis(prev, removed.name, diagnosisPrefix));
    }
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const warrantyDays = Math.max(0, Number.parseInt(warrantyInput.replace(/\D/g, ''), 10) || 0);
      return ordersApi.updateQuote(orderId, item.id, {
        technicalDiagnosis: diagnosis.trim() || undefined,
        laborCost: labor,
        partsCost: parts,
        partsCostActual: partsActual,
        discount,
        warrantyDays,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['bench-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['orders-list'] });
      void queryClient.invalidateQueries({ queryKey: ['orders-profitability'] });
      onClose();
    },
    onError: (err) => {
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to update quote');
    },
  });

  const handleSave = () => {
    setErrorMsg(null);
    if (computedTotal < 0) {
      setErrorMsg(
        locale === 'pt-BR'
          ? 'O desconto não pode ser maior que mão de obra + peças.'
          : 'Discount cannot exceed labor + parts cost.'
      );
      return;
    }
    saveMutation.mutate();
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
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
          {locale === 'pt-BR' ? 'Diagnóstico e Orçamento' : 'Diagnosis & Quote'}
        </Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        {errorMsg ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        {/* 1-Tap Common Parts Picker (filtered by appliance type + multi-appliance/universal) */}
        <View style={styles.catalogCard}>
          <View style={styles.catalogHeader}>
            <View style={styles.catalogHeaderLeft}>
              <Package size={14} color={colors.brandPrimary} />
              <Text style={styles.catalogOverline} numberOfLines={1}>
                {showAllParts
                  ? locale === 'pt-BR'
                    ? 'TODAS AS PEÇAS (1 TOQUE)'
                    : 'ALL PARTS (1-TAP)'
                  : locale === 'pt-BR'
                    ? `PEÇAS · ${item.applianceType.toUpperCase()}`
                    : `PARTS · ${item.applianceType.toUpperCase()}`}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {hiddenOtherCount > 0 || showAllParts ? (
                <Pressable onPress={() => setShowAllParts((prev) => !prev)} hitSlop={8}>
                  <Text style={styles.catalogManageLink}>
                    {showAllParts
                      ? locale === 'pt-BR'
                        ? `Só ${item.applianceType}`
                        : `Only ${item.applianceType}`
                      : locale === 'pt-BR'
                        ? `Ver todas (${allPartsSorted.length})`
                        : `View all (${allPartsSorted.length})`}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setCatalogModalOpen(true)} hitSlop={8}>
                <Text style={styles.catalogManageLink}>
                  {locale === 'pt-BR' ? 'Gerenciar' : 'Manage'}
                </Text>
              </Pressable>
            </View>
          </View>

          {catalogQuery.isLoading ? (
            <ActivityIndicator size="small" color={colors.brandPrimary} />
          ) : allPartsSorted.length === 0 ? (
            <View style={styles.catalogEmptyRow}>
              <Text style={styles.catalogEmptyText}>
                {locale === 'pt-BR'
                  ? 'Carregue peças padrão para orçar em 1 toque.'
                  : 'Load starter parts for 1-tap quoting.'}
              </Text>
              <Pressable
                disabled={seedMutation.isPending}
                onPress={() => seedMutation.mutate()}
                style={styles.seedChipBtn}
              >
                {seedMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.brandPrimary} />
                ) : (
                  <>
                    <Sparkles size={13} color={colors.brandPrimary} />
                    <Text style={styles.seedChipText}>
                      {locale === 'pt-BR' ? 'Carregar 10 peças' : 'Load 10 parts'}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : displayedParts.length === 0 ? (
            <View style={styles.catalogEmptyRow}>
              <Text style={styles.catalogEmptyText}>
                {locale === 'pt-BR'
                  ? `Nenhuma peça vinculada a ${item.applianceType}.`
                  : `No parts linked to ${item.applianceType}.`}
              </Text>
              <Pressable
                onPress={() => setShowAllParts(true)}
                style={styles.seedChipBtn}
              >
                <Text style={styles.seedChipText}>
                  {locale === 'pt-BR'
                    ? `Ver todas (${allPartsSorted.length})`
                    : `Show all (${allPartsSorted.length})`}
                </Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.catalogChipsRow}
            >
              {displayedParts.map((part) => {
                const matchKind = classifyPartForAppliance(part, item.applianceType);
                const isRelevant = matchKind === 'exact';
                return (
                  <Pressable
                    key={part.id}
                    onPress={() => handleApplyPart(part)}
                    style={({ pressed }) => [
                      styles.partChip,
                      isRelevant && styles.partChipRelevant,
                      pressed && styles.partChipPressed,
                    ]}
                  >
                    <View style={styles.partChipTop}>
                      <Plus size={12} color={colors.brandPrimary} strokeWidth={2.5} />
                      <Text style={styles.partChipName} numberOfLines={1}>
                        {part.name}
                      </Text>
                    </View>
                    <Text style={styles.partChipPrice}>
                      {formatCurrency(part.suggestedPrice)}
                      <Text style={styles.partChipCost}>
                        {' '}
                        ({locale === 'pt-BR' ? 'custo' : 'cost'} {formatCurrency(part.averageCost)})
                      </Text>
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {appliedParts.length > 0 ? (
            <View style={styles.appliedWrap}>
              {appliedParts.map((part, idx) => (
                <View key={`${part.id}-${idx}`} style={styles.appliedTag}>
                  <Text style={styles.appliedTagText}>
                    {part.name} ({formatCurrency(part.suggestedPrice)})
                  </Text>
                  <Pressable onPress={() => handleRemoveAppliedPart(idx)} hitSlop={6}>
                    <X size={12} color={colors.brandPrimary} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <TextField
          label={locale === 'pt-BR' ? 'Diagnóstico técnico' : 'Technical diagnosis'}
          placeholder={
            locale === 'pt-BR'
              ? 'Ex: Magnetron em curto e fusível de alta tensão queimado'
              : 'Describe findings and repair plan...'
          }
          value={diagnosis}
          onChangeText={setDiagnosis}
          multiline
          numberOfLines={4}
          style={styles.textarea}
        />

        <View style={styles.row}>
          <View style={styles.col}>
            <TextField
              label={locale === 'pt-BR' ? 'Mão de obra (R$)' : 'Labor (R$)'}
              placeholder="0,00"
              value={laborInput}
              onChangeText={(val) => setLaborInput(maskCurrencyBRL(val))}
              keyboardType="number-pad"
              mono
            />
          </View>
          <View style={styles.col}>
            <TextField
              label={locale === 'pt-BR' ? 'Peças — Cliente (R$)' : 'Parts — Client (R$)'}
              placeholder="0,00"
              value={partsInput}
              onChangeText={(val) => setPartsInput(maskCurrencyBRL(val))}
              keyboardType="number-pad"
              mono
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.col}>
            <TextField
              label={locale === 'pt-BR' ? 'Custo peças — Interno' : 'Actual parts cost'}
              placeholder="0,00"
              value={partsActualInput}
              onChangeText={(val) => setPartsActualInput(maskCurrencyBRL(val))}
              keyboardType="number-pad"
              mono
            />
          </View>
          <View style={styles.col}>
            <TextField
              label={locale === 'pt-BR' ? 'Desconto (R$)' : 'Discount (R$)'}
              placeholder="0,00"
              value={discountInput}
              onChangeText={(val) => setDiscountInput(maskCurrencyBRL(val))}
              keyboardType="number-pad"
              mono
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.col}>
            <TextField
              label={locale === 'pt-BR' ? 'Garantia (dias)' : 'Warranty (days)'}
              placeholder="90"
              value={warrantyInput}
              onChangeText={(val) => setWarrantyInput(maskInteger(val, 4))}
              keyboardType="number-pad"
              maxLength={4}
              mono
            />
          </View>
          <View style={styles.col} />
        </View>

        <View style={[styles.totalBox, computedTotal < 0 && styles.totalBoxError]}>
          <Text style={styles.totalLabel}>
            {locale === 'pt-BR' ? 'Total ao cliente' : 'Client total'}
          </Text>
          <Text style={[styles.totalValue, computedTotal < 0 && styles.totalValueError]}>
            {formatCurrency(computedTotal)}
          </Text>
        </View>

        {/* Internal Real Margin Preview */}
        <View style={[styles.marginBox, estimatedNetProfit < 0 && styles.marginBoxDanger]}>
          <View style={styles.marginLeft}>
            <View style={styles.marginTitleRow}>
              <TrendingUp
                size={14}
                color={estimatedNetProfit < 0 ? colors.dangerDark : colors.successDark}
              />
              <Text
                style={[
                  styles.marginTitle,
                  estimatedNetProfit < 0 && styles.marginTitleDanger,
                ]}
              >
                {locale === 'pt-BR' ? 'Lucro líquido estimado' : 'Estimated net profit'}
              </Text>
            </View>
            <Text style={styles.marginSubtitle}>
              {locale === 'pt-BR'
                ? 'Uso interno — não aparece para o cliente'
                : 'Internal only — hidden from customer'}
            </Text>
          </View>
          <View style={styles.marginRight}>
            <Text
              style={[
                styles.marginAmount,
                estimatedNetProfit < 0 && styles.marginTitleDanger,
              ]}
            >
              {estimatedNetProfit < 0
                ? `- ${formatCurrency(Math.abs(estimatedNetProfit))}`
                : formatCurrency(estimatedNetProfit)}
            </Text>
            {computedTotal > 0 ? (
              <Text style={styles.marginPct}>{marginPct}%</Text>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: isKeyboardVisible ? spacing.md : Math.max(insets.bottom, spacing.lg) },
        ]}
      >
        <Button
          label={locale === 'pt-BR' ? 'Salvar orçamento' : 'Save quote'}
          onPress={handleSave}
          loading={saveMutation.isPending}
        />
      </View>

      <PartsCatalogModal
        visible={catalogModalOpen}
        onClose={() => setCatalogModalOpen(false)}
      />
    </KeyboardAvoidingView>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  spacer: { width: 36 },
  body: {
    padding: spacing.lg,
    gap: 14,
  },
  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    padding: 12,
  },
  errorText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.dangerDark,
  },
  catalogCard: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: 12,
    gap: 10,
  },
  catalogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  catalogHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  catalogOverline: {
    fontFamily: fonts.monoBold,
    fontSize: 10.5,
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
  catalogManageLink: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.brandPrimary,
  },
  catalogEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  catalogEmptyText: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  seedChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  seedChipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    color: colors.brandPrimary,
  },
  catalogChipsRow: {
    gap: 8,
  },
  partChip: {
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
    maxWidth: 190,
  },
  partChipRelevant: {
    backgroundColor: colors.brandPrimarySoft,
    borderColor: colors.brandPrimaryBorder,
  },
  partChipPressed: {
    opacity: 0.8,
  },
  partChipTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  partChipName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  partChipPrice: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    color: colors.brandPrimary,
  },
  partChipCost: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: colors.textMuted,
  },
  appliedWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  appliedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brandPrimarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  appliedTagText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.brandPrimary,
  },
  textarea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  col: {
    flex: 1,
  },
  totalBox: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalBoxError: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  totalLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  totalValue: {
    fontFamily: fonts.monoBold,
    fontSize: 20,
    color: colors.textPrimary,
  },
  totalValueError: {
    color: colors.dangerDark,
  },
  marginBox: {
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: radius.lg,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  marginBoxDanger: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  marginLeft: {
    flex: 1,
    gap: 2,
  },
  marginTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  marginTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.successDark,
  },
  marginTitleDanger: {
    color: colors.dangerDark,
  },
  marginSubtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  marginRight: {
    alignItems: 'flex-end',
  },
  marginAmount: {
    fontFamily: fonts.monoBold,
    fontSize: 16,
    color: colors.successDark,
  },
  marginPct: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: colors.successDark,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
});
