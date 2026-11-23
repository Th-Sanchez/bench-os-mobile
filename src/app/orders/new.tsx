import React, { useState } from 'react';
import {
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
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  ClipboardCheck,
  Pencil,
  PlusCircle,
  Search,
  Trash2,
  User,
  UserPlus,
  X,
} from 'lucide-react-native';
import { customersApi, ordersApi } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { CustomerFormModal } from '@/components/customers/CustomerFormModal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TagBadge } from '@/components/ui/TagBadge';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { CustomerResponse, Voltage } from '@/types/api';
import { compressAndUploadItemPhoto } from '@/utils/imageUpload';

const QUICK_APPLIANCE_TYPES = [
  'Micro-ondas',
  'Air Fryer',
  'Liquidificador',
  'Aspirador',
  'Batedeira',
  'Outro',
];

const VOLTAGE_OPTIONS: Voltage[] = ['V110', 'V220', 'BIVOLT', 'BATTERY'];

interface DraftApplianceItem {
  localId: string;
  applianceType: string;
  customType: string;
  brand: string;
  model: string;
  voltage: Voltage;
  reportedIssue: string;
  accessories: string;
  serialNumber: string;
  intakePhotoUris: string[];
}

function createEmptyItem(): DraftApplianceItem {
  return {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    applianceType: 'Micro-ondas',
    customType: '',
    brand: '',
    model: '',
    voltage: 'V110',
    reportedIssue: '',
    accessories: '',
    serialNumber: '',
    intakePhotoUris: [],
  };
}

export default function NewOrderScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, locale, formatPhone } = useI18n();
  const params = useLocalSearchParams<{
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
  }>();

  const [selectedCustomer, setSelectedCustomer] = useState<{
    id: string;
    name: string;
    phone: string;
  } | null>(
    params.customerId && params.customerName
      ? {
          id: params.customerId,
          name: params.customerName,
          phone: params.customerPhone ?? '',
        }
      : null
  );

  const [customerSearch, setCustomerSearch] = useState('');
  const [newCustomerModalOpen, setNewCustomerModalOpen] = useState(false);

  const [items, setItems] = useState<DraftApplianceItem[]>([createEmptyItem()]);
  const [expandedIndex, setExpandedIndex] = useState<number>(0);
  const [orderNotes, setOrderNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const customersQuery = useQuery({
    queryKey: ['customers', customerSearch.trim()],
    queryFn: () => customersApi.search(customerSearch.trim() || undefined),
    enabled: selectedCustomer === null,
  });

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) {
        throw new Error(
          locale === 'pt-BR' ? 'Selecione um cliente primeiro.' : 'Select a customer first.'
        );
      }

      const payloadItems = items.map((item) => {
        const resolvedType =
          item.applianceType === 'Outro' ? item.customType.trim() : item.applianceType.trim();
        return {
          applianceType: resolvedType,
          brand: item.brand.trim(),
          model: item.model.trim() || undefined,
          voltage: item.voltage,
          serialNumber: item.serialNumber.trim() || undefined,
          accessories: item.accessories.trim() || undefined,
          reportedIssue: item.reportedIssue.trim(),
        };
      });

      const createdOrder = await ordersApi.create({
        customerId: selectedCustomer.id,
        notes: orderNotes.trim() || undefined,
        items: payloadItems,
      });

      // Upload optional intake photos directly to Cloudflare R2 (zero binary bytes on JVM)
      const uploadTasks: Promise<unknown>[] = [];
      createdOrder.items.forEach((createdItem, index) => {
        const uris = items[index]?.intakePhotoUris ?? [];
        for (const uri of uris) {
          uploadTasks.push(
            compressAndUploadItemPhoto(createdOrder.id, createdItem.id, uri, 'INTAKE').catch(
              () => {
                // Keep order creation successful even if one optional photo upload fails
              }
            )
          );
        }
      });

      if (uploadTasks.length > 0) {
        await Promise.all(uploadTasks);
      }

      return createdOrder;
    },
    onSuccess: (createdOrder) => {
      void queryClient.invalidateQueries({ queryKey: ['bench-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });

      const tagsList = createdOrder.items.map((i) => `#${i.tag}`).join(', ');
      Alert.alert(
        locale === 'pt-BR'
          ? `OS #${createdOrder.orderNumber} aberta!`
          : `Order #${createdOrder.orderNumber} created!`,
        locale === 'pt-BR'
          ? `Etiquetas físicas geradas: ${tagsList}`
          : `Generated bench tags: ${tagsList}`,
        [
          {
            text: 'OK',
            onPress: () => {
              router.replace('/(tabs)/workbench');
            },
          },
        ]
      );
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg(t.common.errorGeneric);
      }
    },
  });

  const updateItem = (index: number, patch: Partial<DraftApplianceItem>) => {
    setItems((prev) => prev.map((it, idx) => (idx === index ? { ...it, ...patch } : it)));
  };

  const handleAddItem = () => {
    const nextItem = createEmptyItem();
    setItems((prev) => [...prev, nextItem]);
    setExpandedIndex(items.length);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== index));
    setExpandedIndex((prev) => Math.max(0, Math.min(prev, items.length - 2)));
  };

  const handlePickPhoto = async (index: number) => {
    const pickFromCamera = async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          locale === 'pt-BR' ? 'Permissão necessária' : 'Permission required',
          locale === 'pt-BR'
            ? 'Permita o acesso à câmera nas configurações do aparelho.'
            : 'Please enable camera permissions in device settings.'
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        updateItem(index, {
          intakePhotoUris: [...items[index].intakePhotoUris, result.assets[0].uri],
        });
      }
    };

    const pickFromGallery = async () => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        updateItem(index, {
          intakePhotoUris: [...items[index].intakePhotoUris, result.assets[0].uri],
        });
      }
    };

    Alert.alert(
      locale === 'pt-BR' ? 'Foto de entrada' : 'Intake photo',
      locale === 'pt-BR' ? 'Como deseja adicionar a foto?' : 'Choose photo source',
      [
        { text: locale === 'pt-BR' ? 'Tirar foto' : 'Take photo', onPress: () => void pickFromCamera() },
        { text: locale === 'pt-BR' ? 'Galeria' : 'Photo library', onPress: () => void pickFromGallery() },
        { text: t.common.cancel, style: 'cancel' },
      ]
    );
  };

  const handleSubmit = () => {
    setErrorMsg(null);
    if (!selectedCustomer) {
      setErrorMsg(
        locale === 'pt-BR'
          ? 'Selecione ou cadastre um cliente antes de abrir a OS.'
          : 'Please select or create a customer first.'
      );
      return;
    }

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const resolvedType =
        item.applianceType === 'Outro' ? item.customType.trim() : item.applianceType.trim();
      if (!resolvedType || !item.brand.trim() || !item.reportedIssue.trim()) {
        setExpandedIndex(i);
        setErrorMsg(
          locale === 'pt-BR'
            ? `Item ${i + 1}: informe o tipo, a marca e o defeito relatado.`
            : `Item ${i + 1}: appliance type, brand, and reported issue are required.`
        );
        return;
      }
    }

    createOrderMutation.mutate();
  };

  const handleCustomerCreated = (customer: CustomerResponse) => {
    setSelectedCustomer({ id: customer.id, name: customer.name, phone: customer.phone });
    setCustomerSearch('');
  };

  const ctaLabel =
    locale === 'pt-BR'
      ? `Abrir OS · ${items.length} ${items.length === 1 ? 'aparelho' : 'aparelhos'}`
      : `Open Order · ${items.length} ${items.length === 1 ? 'item' : 'items'}`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top Navigation Bar */}
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={8}>
            <X size={21} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.topBarTitle}>
            {locale === 'pt-BR' ? 'Nova OS' : 'New Order'}
          </Text>
          <TagBadge label="AUTO #OS" variant="subtle" />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {errorMsg ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {/* SECTION 1: CUSTOMER */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionOverline}>
                {locale === 'pt-BR' ? '1. CLIENTE' : '1. CUSTOMER'}
              </Text>
              <Pressable
                onPress={() => setNewCustomerModalOpen(true)}
                style={styles.inlineLinkBtn}
              >
                <UserPlus size={14} color={colors.brandPrimary} />
                <Text style={styles.inlineLinkText}>
                  {locale === 'pt-BR' ? '+ Novo cliente' : '+ New customer'}
                </Text>
              </Pressable>
            </View>

            {selectedCustomer ? (
              <View style={styles.selectedCustomerBox}>
                <View style={styles.selectedCustomerLeft}>
                  <View style={styles.customerAvatar}>
                    <User size={16} color={colors.brandPrimary} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.selectedCustomerName} numberOfLines={1}>
                      {selectedCustomer.name}
                    </Text>
                    <Text style={styles.selectedCustomerPhone}>
                      {formatPhone(selectedCustomer.phone)}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => setSelectedCustomer(null)}
                  style={styles.changeBtn}
                >
                  <Text style={styles.changeBtnText}>
                    {locale === 'pt-BR' ? 'Trocar' : 'Change'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.customerPicker}>
                <View style={styles.customerSearchInputRow}>
                  <Search size={16} color={colors.textMuted} />
                  <TextInput
                    value={customerSearch}
                    onChangeText={setCustomerSearch}
                    placeholder={
                      locale === 'pt-BR'
                        ? 'Buscar por telefone ou nome...'
                        : 'Search by phone or name...'
                    }
                    placeholderTextColor={colors.textMuted}
                    style={styles.customerSearchInput}
                  />
                </View>

                <View style={styles.customerSuggestions}>
                  {(customersQuery.data ?? []).slice(0, 4).map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() =>
                        setSelectedCustomer({ id: c.id, name: c.name, phone: c.phone })
                      }
                      style={({ pressed }) => [
                        styles.suggestionRow,
                        pressed && styles.suggestionRowPressed,
                      ]}
                    >
                      <Text style={styles.suggestionName} numberOfLines={1}>
                        {c.name}
                      </Text>
                      <Text style={styles.suggestionPhone}>{formatPhone(c.phone)}</Text>
                    </Pressable>
                  ))}
                  {customersQuery.data && customersQuery.data.length === 0 ? (
                    <Text style={styles.emptySuggestion}>
                      {locale === 'pt-BR'
                        ? 'Nenhum cliente encontrado — toque em "+ Novo cliente".'
                        : 'No customer found — tap "+ New customer".'}
                    </Text>
                  ) : null}
                </View>
              </View>
            )}
          </Card>

          {/* SECTION 2: APPLIANCES */}
          <View style={styles.appliancesHeader}>
            <Text style={styles.sectionOverline}>
              {locale === 'pt-BR' ? '2. APARELHOS NA NOTA' : '2. APPLIANCES IN ORDER'}
            </Text>
            <TagBadge
              label={`${items.length} ${items.length === 1 ? 'item' : 'itens'}`}
              variant="subtle"
            />
          </View>

          {items.map((item, index) => {
            const isExpanded = expandedIndex === index;
            const resolvedType =
              item.applianceType === 'Outro' ? item.customType || 'Aparelho' : item.applianceType;
            const summaryTitle = [resolvedType, item.brand, item.model]
              .filter(Boolean)
              .join(' ');

            if (!isExpanded) {
              return (
                <Card key={item.localId} style={styles.collapsedCard}>
                  <View style={styles.collapsedTopRow}>
                    <View style={styles.tagRow}>
                      <TagBadge label={`Item ${index + 1}`} variant="dark" />
                      <TagBadge label={t.voltage[item.voltage]} variant="subtle" />
                    </View>
                    <View style={styles.collapsedActions}>
                      <Pressable
                        onPress={() => setExpandedIndex(index)}
                        style={styles.miniIconBtn}
                      >
                        <Pencil size={15} color={colors.textSecondary} />
                      </Pressable>
                      {items.length > 1 ? (
                        <Pressable
                          onPress={() => handleRemoveItem(index)}
                          style={styles.miniIconBtn}
                        >
                          <Trash2 size={15} color={colors.danger} />
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                  <Text style={styles.collapsedTitle} numberOfLines={1}>
                    {summaryTitle || `Item ${index + 1}`}
                  </Text>
                  <Text style={styles.collapsedSub} numberOfLines={1}>
                    {[item.reportedIssue, item.accessories].filter(Boolean).join(' · ') ||
                      (locale === 'pt-BR' ? 'Toque no lápis para completar' : 'Tap edit to complete')}
                  </Text>
                </Card>
              );
            }

            return (
              <Card
                key={item.localId}
                accentBorderColor={colors.brandPrimaryBorder}
                style={styles.expandedCard}
              >
                <View style={styles.collapsedTopRow}>
                  <TagBadge label={`Item ${index + 1}`} variant="dark" />
                  {items.length > 1 ? (
                    <Pressable
                      onPress={() => handleRemoveItem(index)}
                      style={styles.removeBtn}
                    >
                      <Trash2 size={13} color={colors.danger} />
                      <Text style={styles.removeText}>{t.common.remove}</Text>
                    </Pressable>
                  ) : null}
                </View>

                {/* Appliance Type Quick Chips */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.monoLabel}>
                    {locale === 'pt-BR' ? 'Tipo de aparelho' : 'Appliance type'}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.typeChipsRow}
                  >
                    {QUICK_APPLIANCE_TYPES.map((typeOption) => {
                      const active = item.applianceType === typeOption;
                      return (
                        <Pressable
                          key={typeOption}
                          onPress={() => updateItem(index, { applianceType: typeOption })}
                          style={[styles.typeChip, active && styles.typeChipActive]}
                        >
                          <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                            {typeOption}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  {item.applianceType === 'Outro' ? (
                    <TextInput
                      value={item.customType}
                      onChangeText={(val) => updateItem(index, { customType: val })}
                      placeholder={
                        locale === 'pt-BR' ? 'Ex: Cafeteira, Ferro de passar...' : 'e.g. Coffee Maker...'
                      }
                      placeholderTextColor={colors.textMuted}
                      style={styles.filledInput}
                    />
                  ) : null}
                </View>

                {/* Two-column Brand & Model */}
                <View style={styles.twoColRow}>
                  <View style={styles.col}>
                    <Text style={styles.monoLabel}>
                      {locale === 'pt-BR' ? 'Marca *' : 'Brand *'}
                    </Text>
                    <TextInput
                      value={item.brand}
                      onChangeText={(val) => updateItem(index, { brand: val })}
                      placeholder="Ex: Mondial"
                      placeholderTextColor={colors.textMuted}
                      style={styles.filledInput}
                    />
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.monoLabel}>
                      {locale === 'pt-BR' ? 'Modelo' : 'Model'}
                    </Text>
                    <TextInput
                      value={item.model}
                      onChangeText={(val) => updateItem(index, { model: val })}
                      placeholder="Ex: AF-30"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.filledInput, styles.monoTextInput]}
                    />
                  </View>
                </View>

                {/* Voltage Selector */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.monoLabel}>
                    {locale === 'pt-BR' ? 'Voltagem' : 'Voltage'}
                  </Text>
                  <View style={styles.voltageRow}>
                    {VOLTAGE_OPTIONS.map((v) => {
                      const active = item.voltage === v;
                      return (
                        <Pressable
                          key={v}
                          onPress={() => updateItem(index, { voltage: v })}
                          style={[styles.voltageBtn, active && styles.voltageBtnActive]}
                        >
                          <Text style={[styles.voltageText, active && styles.voltageTextActive]}>
                            {t.voltage[v]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Reported Issue */}
                <View style={styles.fieldGroup}>
                  <View style={styles.labelRowBetween}>
                    <Text style={styles.monoLabel}>
                      {locale === 'pt-BR' ? 'Defeito relatado *' : 'Reported issue *'}
                    </Text>
                    <Text style={styles.requiredTag}>{t.common.required}</Text>
                  </View>
                  <TextInput
                    value={item.reportedIssue}
                    onChangeText={(val) => updateItem(index, { reportedIssue: val })}
                    placeholder={
                      locale === 'pt-BR'
                        ? 'Ex: Não liga na tomada após queda de energia'
                        : 'Describe the issue reported by the customer...'
                    }
                    placeholderTextColor={colors.textMuted}
                    multiline
                    numberOfLines={3}
                    style={[styles.filledInput, styles.textareaInput]}
                  />
                </View>

                {/* Accessories */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.monoLabel}>
                    {locale === 'pt-BR' ? 'Acessórios (opcional)' : 'Accessories (optional)'}
                  </Text>
                  <TextInput
                    value={item.accessories}
                    onChangeText={(val) => updateItem(index, { accessories: val })}
                    placeholder={
                      locale === 'pt-BR'
                        ? 'Ex: Prato de vidro, cesto removível'
                        : 'e.g. Glass turntable, basket'
                    }
                    placeholderTextColor={colors.textMuted}
                    style={styles.filledInput}
                  />
                </View>

                {/* Intake Photos Strip */}
                <View style={styles.fieldGroup}>
                  {item.intakePhotoUris.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.thumbRow}
                    >
                      {item.intakePhotoUris.map((uri, photoIdx) => (
                        <View key={uri} style={styles.thumbBox}>
                          <Image source={{ uri }} style={styles.thumbImage} contentFit="cover" />
                          <Pressable
                            onPress={() =>
                              updateItem(index, {
                                intakePhotoUris: item.intakePhotoUris.filter(
                                  (_, idx) => idx !== photoIdx
                                ),
                              })
                            }
                            style={styles.thumbRemoveBtn}
                          >
                            <X size={12} color={colors.textOnDark} />
                          </Pressable>
                        </View>
                      ))}
                    </ScrollView>
                  ) : null}

                  <Pressable
                    onPress={() => void handlePickPhoto(index)}
                    style={({ pressed }) => [styles.cameraStrip, pressed && styles.btnPressed]}
                  >
                    <Camera size={17} color={colors.brandPrimary} />
                    <Text style={styles.cameraStripText}>
                      {locale === 'pt-BR'
                        ? 'Tirar foto de entrada (opcional)'
                        : 'Add intake photo (optional)'}
                    </Text>
                  </Pressable>
                </View>
              </Card>
            );
          })}

          {/* Add Another Appliance Button */}
          <Button
            label={
              locale === 'pt-BR'
                ? '+ Adicionar outro aparelho na nota'
                : '+ Add another appliance to order'
            }
            variant="dashed"
            onPress={handleAddItem}
            icon={<PlusCircle size={17} color={colors.brandPrimary} />}
          />

          {/* Optional Order Notes */}
          <Card style={styles.notesCard}>
            <Text style={styles.monoLabel}>
              {locale === 'pt-BR'
                ? 'Observações internas da nota (opcional)'
                : 'Internal order notes (optional)'}
            </Text>
            <TextInput
              value={orderNotes}
              onChangeText={setOrderNotes}
              placeholder={
                locale === 'pt-BR' ? 'Ex: Cliente precisa até sábado' : 'e.g. Urgent for Saturday'
              }
              placeholderTextColor={colors.textMuted}
              style={styles.filledInput}
            />
          </Card>
        </ScrollView>

        {/* Sticky Bottom CTA */}
        <View style={styles.stickyFooter}>
          <Button
            label={ctaLabel}
            onPress={handleSubmit}
            loading={createOrderMutation.isPending}
            icon={
              !createOrderMutation.isPending ? (
                <ClipboardCheck size={18} color={colors.textOnDark} />
              ) : undefined
            }
          />
        </View>
      </KeyboardAvoidingView>

      <CustomerFormModal
        visible={newCustomerModalOpen}
        onClose={() => setNewCustomerModalOpen(false)}
        onSaved={handleCustomerCreated}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgCanvas,
  },
  flex: {
    flex: 1,
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
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 32,
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
    fontSize: 12.5,
    color: colors.dangerDark,
  },
  sectionCard: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionOverline: {
    fontFamily: fonts.monoBold,
    fontSize: 10.5,
    letterSpacing: 0.7,
    color: colors.textSecondary,
  },
  inlineLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  inlineLinkText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13.5,
    color: colors.brandPrimary,
  },
  selectedCustomerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: '#F2F5FF',
    borderRadius: radius.md,
    padding: 10,
  },
  selectedCustomerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  customerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCustomerName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14.5,
    color: colors.textPrimary,
  },
  selectedCustomerPhone: {
    fontFamily: fonts.monoMedium,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  changeBtn: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  changeBtnText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textPrimary,
  },
  customerPicker: {
    gap: 8,
  },
  customerSearchInputRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  customerSearchInput: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  customerSuggestions: {
    gap: 4,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.bgCanvas,
  },
  suggestionRowPressed: {
    backgroundColor: colors.brandPrimarySoft,
  },
  suggestionName: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13.5,
    color: colors.textPrimary,
    flex: 1,
  },
  suggestionPhone: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  emptySuggestion: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textMuted,
    paddingVertical: 6,
  },
  appliancesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: 4,
  },
  collapsedCard: {
    gap: 6,
  },
  collapsedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  collapsedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniIconBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 15.5,
    color: colors.textPrimary,
  },
  collapsedSub: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  expandedCard: {
    gap: 14,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  removeText: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: colors.danger,
  },
  fieldGroup: {
    gap: 6,
  },
  monoLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  labelRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  requiredTag: {
    fontFamily: fonts.monoMedium,
    fontSize: 10.5,
    color: colors.warningDark,
  },
  typeChipsRow: {
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: '#F2F5FF',
  },
  typeChipActive: {
    backgroundColor: colors.brandPrimary,
  },
  typeChipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  typeChipTextActive: {
    color: colors.textOnDark,
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 10,
  },
  col: {
    flex: 1,
    gap: 6,
  },
  filledInput: {
    minHeight: 44,
    backgroundColor: '#F2F5FF',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  monoTextInput: {
    fontFamily: fonts.monoMedium,
    fontSize: 13,
  },
  textareaInput: {
    minHeight: 74,
    textAlignVertical: 'top',
  },
  voltageRow: {
    flexDirection: 'row',
    gap: 6,
  },
  voltageBtn: {
    flex: 1,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: '#F2F5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voltageBtnActive: {
    backgroundColor: colors.darkPillBg,
  },
  voltageText: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  voltageTextActive: {
    fontFamily: fonts.monoBold,
    color: colors.textOnDark,
  },
  thumbRow: {
    gap: 8,
    marginBottom: 4,
  },
  thumbBox: {
    width: 68,
    height: 68,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraStrip: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cameraStripText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13.5,
    color: colors.brandPrimary,
  },
  btnPressed: {
    opacity: 0.8,
  },
  notesCard: {
    gap: 6,
  },
  stickyFooter: {
    padding: spacing.lg,
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
});
