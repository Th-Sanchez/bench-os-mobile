import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Package,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native';
import { partsCatalogApi, tenantSettingsApi } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { DEFAULT_APPLIANCE_TYPES } from '@/constants/appliances';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { PartCatalogResponse, UpsertPartCatalogRequest } from '@/types/api';
import { formatCurrencyInput, maskCurrencyBRL, parseCurrencyBRL } from '@/utils/masks';

const QUICK_CATEGORIES: string[] = ['Geral', ...DEFAULT_APPLIANCE_TYPES];

function parseCategories(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function toggleCategoryInList(currentRaw: string, clicked: string): string {
  const clickedLower = clicked.trim().toLowerCase();
  const isUniversal = clickedLower === 'geral' || clickedLower === 'universal';
  const existing = parseCategories(currentRaw);

  if (isUniversal) {
    const alreadyUniversal = existing.some((c) => c.toLowerCase() === 'geral');
    return alreadyUniversal ? '' : 'Geral';
  }

  const withoutUniversal = existing.filter(
    (c) => c.toLowerCase() !== 'geral' && c.toLowerCase() !== 'universal'
  );
  const existsIdx = withoutUniversal.findIndex((c) => c.toLowerCase() === clickedLower);

  if (existsIdx >= 0) {
    withoutUniversal.splice(existsIdx, 1);
  } else {
    withoutUniversal.push(clicked.trim());
  }

  return withoutUniversal.join(', ');
}

interface PartsCatalogModalProps {
  visible: boolean;
  onClose: () => void;
}

export function PartsCatalogModal({ visible, onClose }: PartsCatalogModalProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {visible ? <PartsCatalogBody onClose={onClose} /> : null}
    </Modal>
  );
}

function PartsCatalogBody({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardVisible();
  const { locale, t, formatCurrency } = useI18n();

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<PartCatalogResponse | null>(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [avgCostInput, setAvgCostInput] = useState('');
  const [suggestedPriceInput, setSuggestedPriceInput] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const catalogQuery = useQuery({
    queryKey: ['parts-catalog'],
    queryFn: () => partsCatalogApi.list(),
  });

  const settingsQuery = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.get(),
  });

  const categoryOptions = useMemo(() => {
    const custom = settingsQuery.data?.customApplianceTypes ?? [];
    const seen = new Set(QUICK_CATEGORIES.map((c) => c.toLowerCase()));
    const extras = custom.filter((c) => !seen.has(c.trim().toLowerCase()));
    return [...QUICK_CATEGORIES, ...extras];
  }, [settingsQuery.data?.customApplianceTypes]);

  const selectedCategories = useMemo(() => parseCategories(category), [category]);

  const parts = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const filteredParts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parts;
    return parts.filter((p) => {
      const hay = `${p.name} ${p.applianceCategory ?? ''} ${p.notes ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [parts, search]);

  const openCreateForm = () => {
    setEditingPart(null);
    setName('');
    setCategory('');
    setAvgCostInput('');
    setSuggestedPriceInput('');
    setNotes('');
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (part: PartCatalogResponse) => {
    setEditingPart(part);
    setName(part.name);
    setCategory(part.applianceCategory ?? '');
    setAvgCostInput(formatCurrencyInput(part.averageCost));
    setSuggestedPriceInput(formatCurrencyInput(part.suggestedPrice));
    setNotes(part.notes ?? '');
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingPart(null);
    setFormError(null);
  };

  const saveMutation = useMutation({
    mutationFn: (payload: UpsertPartCatalogRequest) =>
      editingPart
        ? partsCatalogApi.update(editingPart.id, payload)
        : partsCatalogApi.create(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['parts-catalog'] });
      closeForm();
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : t.common.errorGeneric);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => partsCatalogApi.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['parts-catalog'] });
    },
    onError: (err) => {
      Alert.alert(
        locale === 'pt-BR' ? 'Erro ao remover' : 'Could not delete',
        err instanceof Error ? err.message : t.common.errorGeneric
      );
    },
  });

  const seedMutation = useMutation({
    mutationFn: () => partsCatalogApi.seedDefaults(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['parts-catalog'] });
    },
    onError: (err) => {
      Alert.alert(
        locale === 'pt-BR' ? 'Erro ao carregar sugestões' : 'Could not load presets',
        err instanceof Error ? err.message : t.common.errorGeneric
      );
    },
  });

  const handleSave = () => {
    setFormError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError(locale === 'pt-BR' ? 'Informe o nome da peça.' : 'Enter the part name.');
      return;
    }

    const averageCost = parseCurrencyBRL(avgCostInput);
    const suggestedPrice = parseCurrencyBRL(suggestedPriceInput);
    if (!Number.isFinite(averageCost) || averageCost < 0 || !Number.isFinite(suggestedPrice) || suggestedPrice < 0) {
      setFormError(locale === 'pt-BR' ? 'Informe valores válidos.' : 'Enter valid amounts.');
      return;
    }

    saveMutation.mutate({
      name: trimmedName,
      applianceCategory: category.trim() || undefined,
      averageCost: Number(averageCost.toFixed(2)),
      suggestedPrice: Number(suggestedPrice.toFixed(2)),
      notes: notes.trim() || undefined,
    });
  };

  const confirmDelete = (part: PartCatalogResponse) => {
    Alert.alert(
      locale === 'pt-BR' ? 'Remover peça do catálogo?' : 'Remove part from catalog?',
      part.name,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.remove,
          style: 'destructive',
          onPress: () => deleteMutation.mutate(part.id),
        },
      ]
    );
  };

  const previewCost = parseCurrencyBRL(avgCostInput);
  const previewPrice = parseCurrencyBRL(suggestedPriceInput);
  const previewProfit = Math.round((previewPrice - previewCost) * 100) / 100;

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      {/* Header */}
      <View
        style={[
          styles.header,
          Platform.OS === 'android' && {
            paddingTop: insets.top,
            height: 60 + insets.top,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <Package size={18} color={colors.brandPrimary} />
          <Text style={styles.headerTitle}>
            {formOpen
              ? editingPart
                ? locale === 'pt-BR'
                  ? 'Editar peça'
                  : 'Edit part'
                : locale === 'pt-BR'
                  ? 'Nova peça no catálogo'
                  : 'New catalog part'
              : locale === 'pt-BR'
                ? 'Catálogo de Peças'
                : 'Parts Catalog'}
          </Text>
        </View>
        <Pressable
          onPress={formOpen ? closeForm : onClose}
          style={styles.closeBtn}
          hitSlop={8}
        >
          <X size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {formOpen ? (
        <>
          <ScrollView
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
          >
            {formError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            ) : null}

            <TextField
              label={locale === 'pt-BR' ? 'Nome da peça' : 'Part name'}
              placeholder={
                locale === 'pt-BR'
                  ? 'Ex: Magnetron Universal, Fusível HV 0.7A...'
                  : 'e.g. Universal Magnetron, HV Fuse...'
              }
              value={name}
              onChangeText={setName}
            />

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                {locale === 'pt-BR'
                  ? 'Aparelhos compatíveis (pode selecionar mais de um)'
                  : 'Compatible appliances (multi-select)'}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryRow}
              >
                {categoryOptions.map((cat) => {
                  const active = selectedCategories.some(
                    (c) => c.toLowerCase() === cat.toLowerCase()
                  );
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => setCategory(toggleCategoryInList(category, cat))}
                      style={[styles.catChip, active && styles.catChipActive]}
                    >
                      <Text style={[styles.catChipText, active && styles.catChipTextActive]}>
                        {cat}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <TextField
                placeholder={
                  locale === 'pt-BR'
                    ? 'Ex: Micro-ondas, Air Fryer (ou deixe "Geral" para todos)'
                    : 'e.g. Microwave, Air Fryer (or "Geral" for all)'
                }
                value={category}
                onChangeText={setCategory}
              />
            </View>

            <View style={styles.moneyRow}>
              <View style={styles.moneyCol}>
                <TextField
                  label={locale === 'pt-BR' ? 'Custo médio (R$)' : 'Avg. cost (R$)'}
                  placeholder="0,00"
                  value={avgCostInput}
                  onChangeText={(val) => setAvgCostInput(maskCurrencyBRL(val))}
                  keyboardType="number-pad"
                  mono
                />
              </View>
              <View style={styles.moneyCol}>
                <TextField
                  label={locale === 'pt-BR' ? 'Valor repasse (R$)' : 'Suggested price (R$)'}
                  placeholder="0,00"
                  value={suggestedPriceInput}
                  onChangeText={(val) => setSuggestedPriceInput(maskCurrencyBRL(val))}
                  keyboardType="number-pad"
                  mono
                />
              </View>
            </View>

            <View style={[styles.marginPreview, previewProfit < 0 && styles.marginPreviewWarn]}>
              <Text style={styles.marginPreviewLabel}>
                {locale === 'pt-BR' ? 'Lucro estimado na peça' : 'Estimated part profit'}
              </Text>
              <Text
                style={[
                  styles.marginPreviewValue,
                  previewProfit < 0 && styles.marginPreviewValueWarn,
                ]}
              >
                {previewProfit >= 0 ? '+ ' : '- '}
                {formatCurrency(Math.abs(previewProfit))}
              </Text>
            </View>

            <TextField
              label={locale === 'pt-BR' ? 'Observações técnicas (opcional)' : 'Technical notes (optional)'}
              placeholder={
                locale === 'pt-BR'
                  ? 'Ex: Compatível Brastemp/Electrolux, 220V...'
                  : 'e.g. Compatible models, specs...'
              }
              value={notes}
              onChangeText={setNotes}
            />
          </ScrollView>

          <View
            style={[
              styles.footer,
              { paddingBottom: isKeyboardVisible ? spacing.md : Math.max(insets.bottom, spacing.lg) },
            ]}
          >
            <Button
              label={t.common.cancel}
              variant="secondary"
              onPress={closeForm}
              style={styles.footerBtn}
            />
            <Button
              label={editingPart ? t.common.save : locale === 'pt-BR' ? 'Adicionar peça' : 'Add part'}
              loading={saveMutation.isPending}
              onPress={handleSave}
              style={styles.footerBtn}
            />
          </View>
        </>
      ) : (
        <>
          <View style={styles.toolbar}>
            <View style={styles.searchBox}>
              <Search size={16} color={colors.textMuted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={
                  locale === 'pt-BR'
                    ? 'Buscar peça ou aparelho...'
                    : 'Search part or appliance...'
                }
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
              />
              {search.length > 0 ? (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <X size={15} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
            <Pressable
              onPress={openCreateForm}
              style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
            >
              <Plus size={16} color={colors.textOnDark} strokeWidth={2.4} />
              <Text style={styles.addBtnText}>{locale === 'pt-BR' ? 'Nova' : 'New'}</Text>
            </Pressable>
          </View>

          {catalogQuery.isLoading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.brandPrimary} />
            </View>
          ) : parts.length === 0 ? (
            <View style={styles.centerBox}>
              <View style={styles.emptyIcon}>
                <Package size={26} color={colors.brandPrimary} />
              </View>
              <Text style={styles.emptyTitle}>
                {locale === 'pt-BR'
                  ? 'Nenhuma peça cadastrada ainda'
                  : 'No parts in catalog yet'}
              </Text>
              <Text style={styles.emptySub}>
                {locale === 'pt-BR'
                  ? 'Cadastre as peças mais usadas na bancada para montar orçamentos em 1 toque e calcular a margem real de lucro.'
                  : 'Add frequently used parts for 1-tap quoting and real repair margin tracking.'}
              </Text>
              <View style={styles.emptyActions}>
                <Button
                  label={
                    locale === 'pt-BR'
                      ? 'Carregar 10 peças comuns'
                      : 'Load 10 common parts'
                  }
                  icon={<Sparkles size={16} color={colors.textOnDark} />}
                  loading={seedMutation.isPending}
                  onPress={() => seedMutation.mutate()}
                />
                <Button
                  label={locale === 'pt-BR' ? 'Cadastrar manualmente' : 'Add manually'}
                  variant="secondary"
                  onPress={openCreateForm}
                />
              </View>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: Math.max(insets.bottom + spacing.lg, spacing.xxl) },
              ]}
            >
              {filteredParts.length === 0 ? (
                <Text style={styles.noMatchText}>
                  {locale === 'pt-BR'
                    ? 'Nenhuma peça encontrada com esse filtro.'
                    : 'No matching parts found.'}
                </Text>
              ) : (
                filteredParts.map((part) => (
                  <View key={part.id} style={styles.partCard}>
                    <View style={styles.partTopRow}>
                      <View style={styles.partTitleWrap}>
                        <Text style={styles.partName}>{part.name}</Text>
                        {parseCategories(part.applianceCategory).map((catLabel) => (
                          <View key={catLabel} style={styles.catBadge}>
                            <Text style={styles.catBadgeText}>{catLabel}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={styles.partActions}>
                        <Pressable
                          onPress={() => openEditForm(part)}
                          hitSlop={8}
                          style={styles.iconActionBtn}
                        >
                          <Pencil size={15} color={colors.brandPrimary} />
                        </Pressable>
                        <Pressable
                          onPress={() => confirmDelete(part)}
                          hitSlop={8}
                          style={styles.iconActionBtn}
                        >
                          <Trash2 size={15} color={colors.danger} />
                        </Pressable>
                      </View>
                    </View>

                    {part.notes ? (
                      <Text style={styles.partNotes} numberOfLines={2}>
                        {part.notes}
                      </Text>
                    ) : null}

                    <View style={styles.partPricingRow}>
                      <View style={styles.pricePill}>
                        <Text style={styles.pricePillLabel}>
                          {locale === 'pt-BR' ? 'Custo' : 'Cost'}
                        </Text>
                        <Text style={styles.pricePillVal}>{formatCurrency(part.averageCost)}</Text>
                      </View>
                      <View style={styles.pricePill}>
                        <Text style={styles.pricePillLabel}>
                          {locale === 'pt-BR' ? 'Repasse' : 'Price'}
                        </Text>
                        <Text style={styles.pricePillVal}>{formatCurrency(part.suggestedPrice)}</Text>
                      </View>
                      <View style={[styles.pricePill, styles.profitPill]}>
                        <Text style={styles.profitPillLabel}>
                          {locale === 'pt-BR' ? 'Margem' : 'Profit'}
                        </Text>
                        <Text style={styles.profitPillVal}>
                          + {formatCurrency(part.unitProfit)}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgCanvas,
  },
  header: {
    height: 60,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 40,
  },
  addBtnPressed: {
    backgroundColor: colors.brandPrimaryPressed,
  },
  addBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.textOnDark,
  },
  listContent: {
    padding: spacing.lg,
    gap: 10,
  },
  partCard: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: 12,
    gap: 8,
  },
  partTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  partTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  partName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  catBadge: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  catBadgeText: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: colors.textSecondary,
  },
  partActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconActionBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partNotes: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  partPricingRow: {
    flexDirection: 'row',
    gap: 6,
  },
  pricePill: {
    flex: 1,
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
  },
  pricePillLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 9.5,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  pricePillVal: {
    fontFamily: fonts.monoBold,
    fontSize: 11.5,
    color: colors.textPrimary,
  },
  profitPill: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successBorder,
  },
  profitPillLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 9.5,
    color: colors.successDark,
    textTransform: 'uppercase',
  },
  profitPillVal: {
    fontFamily: fonts.monoBold,
    fontSize: 11.5,
    color: colors.successDark,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: 10,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
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
  emptySub: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  emptyActions: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  noMatchText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 24,
  },
  formContent: {
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
    fontSize: 12,
    color: colors.dangerDark,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  categoryRow: {
    gap: 6,
  },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSurface,
  },
  catChipActive: {
    backgroundColor: colors.brandPrimarySoft,
    borderColor: colors.brandPrimary,
  },
  catChipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  catChipTextActive: {
    fontFamily: fonts.bodySemiBold,
    color: colors.brandPrimary,
  },
  moneyRow: {
    flexDirection: 'row',
    gap: 10,
  },
  moneyCol: {
    flex: 1,
  },
  marginPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  marginPreviewWarn: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  marginPreviewLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textPrimary,
  },
  marginPreviewValue: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    color: colors.successDark,
  },
  marginPreviewValueWarn: {
    color: colors.dangerDark,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  footerBtn: {
    flex: 1,
  },
});
