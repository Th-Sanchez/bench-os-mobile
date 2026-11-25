import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookUser,
  Check,
  CheckCircle2,
  Phone,
  Search,
  Settings,
  X,
} from 'lucide-react-native';
import { customersApi } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { UpsertCustomerRequest } from '@/types/api';
import {
  loadDeviceContacts,
  normalizeBrazilianContactPhone,
  type DeviceContactEntry,
  type DeviceContactPhone,
} from '@/utils/phoneContacts';
import { unmaskDigits } from '@/utils/masks';

const BATCH_CHUNK_SIZE = 200;

export interface SelectedPhoneContact {
  name: string;
  phone: string;
}

interface PhoneContactsModalProps {
  visible: boolean;
  mode: 'single' | 'batch';
  existingPhones?: string[];
  onClose: () => void;
  onSelectSingle?: (contact: SelectedPhoneContact) => void;
  onBatchImported?: (summary: { importedCount: number; duplicatesSkipped: number }) => void;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'denied' | 'unsupported' | 'error';

export function PhoneContactsModal({
  visible,
  mode,
  existingPhones = [],
  onClose,
  onSelectSingle,
  onBatchImported,
}: PhoneContactsModalProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {visible ? (
        <PhoneContactsModalBody
          mode={mode}
          existingPhones={existingPhones}
          onClose={onClose}
          onSelectSingle={onSelectSingle}
          onBatchImported={onBatchImported}
        />
      ) : null}
    </Modal>
  );
}

function PhoneContactsModalBody({
  mode,
  existingPhones = [],
  onClose,
  onSelectSingle,
  onBatchImported,
}: Omit<PhoneContactsModalProps, 'visible'>) {
  const { locale } = useI18n();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [reloadTick, setReloadTick] = useState(0);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [contacts, setContacts] = useState<DeviceContactEntry[]>([]);
  const [searchText, setSearchText] = useState('');
  // Map of contactId -> selected normalized phone number (batch mode)
  const [selectedMap, setSelectedMap] = useState<Record<string, SelectedPhoneContact>>({});
  // Override preferred phone index per contact when contact has multiple numbers
  const [phoneChoiceMap, setPhoneChoiceMap] = useState<Record<string, string>>({});

  const existingPhoneSet = useMemo(() => {
    const set = new Set<string>();
    for (const raw of existingPhones) {
      const rawDigits = unmaskDigits(raw);
      if (rawDigits) set.add(rawDigits);
      const normalized = normalizeBrazilianContactPhone(raw);
      if (normalized) set.add(normalized);
    }
    return set;
  }, [existingPhones]);

  const handleRetryLoad = useCallback(() => {
    setLoadState('loading');
    setReloadTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadDeviceContacts()
      .then((result) => {
        if (cancelled) return;
        if (result.status === 'unsupported') {
          setLoadState('unsupported');
          return;
        }
        if (result.status === 'denied') {
          setCanAskAgain(result.canAskAgain);
          setLoadState('denied');
          return;
        }
        setContacts(result.contacts);
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const getActivePhone = useCallback(
    (entry: DeviceContactEntry): DeviceContactPhone => {
      const chosen = phoneChoiceMap[entry.id];
      if (chosen) {
        const found = entry.phones.find((p) => p.normalized === chosen);
        if (found) return found;
      }
      const firstNew = entry.phones.find((p) => !existingPhoneSet.has(p.normalized));
      return firstNew ?? entry.phones[0];
    },
    [phoneChoiceMap, existingPhoneSet]
  );

  const filteredContacts = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const qDigits = unmaskDigits(searchText);
    if (!q) return contacts;
    return contacts.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (qDigits && c.phones.some((p) => p.normalized.includes(qDigits))) return true;
      return false;
    });
  }, [contacts, searchText]);

  const selectableFiltered = useMemo(() => {
    return filteredContacts.filter((entry) => {
      const active = getActivePhone(entry);
      return !existingPhoneSet.has(active.normalized);
    });
  }, [filteredContacts, getActivePhone, existingPhoneSet]);

  const selectedList = useMemo(() => Object.values(selectedMap), [selectedMap]);

  const batchImportMutation = useMutation({
    mutationFn: async (items: SelectedPhoneContact[]) => {
      let importedCount = 0;
      let duplicatesSkipped = 0;
      let invalidSkipped = 0;

      for (let i = 0; i < items.length; i += BATCH_CHUNK_SIZE) {
        const chunk: UpsertCustomerRequest[] = items.slice(i, i + BATCH_CHUNK_SIZE).map((c) => ({
          name: c.name,
          phone: c.phone,
        }));
        const res = await customersApi.batchImport({ customers: chunk });
        importedCount += res.importedCount;
        duplicatesSkipped += res.duplicatesSkipped;
        invalidSkipped += res.invalidSkipped;
      }

      return { importedCount, duplicatesSkipped, invalidSkipped };
    },
    onSuccess: (summary) => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      onBatchImported?.(summary);
      onClose();
    },
    onError: (err) => {
      Alert.alert(
        locale === 'pt-BR' ? 'Erro ao importar contatos' : 'Import failed',
        err instanceof ApiError
          ? err.message
          : locale === 'pt-BR'
            ? 'Não foi possível concluir a importação. Tente novamente.'
            : 'Unable to import contacts. Please try again.'
      );
    },
  });

  const handleSinglePress = (entry: DeviceContactEntry) => {
    if (entry.phones.length === 1) {
      onSelectSingle?.({ name: entry.name, phone: entry.phones[0].normalized });
      onClose();
      return;
    }

    Alert.alert(
      entry.name,
      locale === 'pt-BR' ? 'Escolha qual telefone usar:' : 'Choose a phone number:',
      [
        ...entry.phones.map((p) => ({
          text: p.label ? `${p.formatted} (${p.label})` : p.formatted,
          onPress: () => {
            onSelectSingle?.({ name: entry.name, phone: p.normalized });
            onClose();
          },
        })),
        { text: locale === 'pt-BR' ? 'Cancelar' : 'Cancel', style: 'cancel' },
      ]
    );
  };

  const toggleBatchContact = (entry: DeviceContactEntry) => {
    const active = getActivePhone(entry);
    if (existingPhoneSet.has(active.normalized)) {
      return;
    }

    setSelectedMap((prev) => {
      if (prev[entry.id]) {
        const next = { ...prev };
        delete next[entry.id];
        return next;
      }
      return {
        ...prev,
        [entry.id]: { name: entry.name, phone: active.normalized },
      };
    });
  };

  const handleCyclePhone = (entry: DeviceContactEntry) => {
    if (entry.phones.length <= 1) return;
    Alert.alert(
      entry.name,
      locale === 'pt-BR' ? 'Selecione o telefone para importar:' : 'Select phone number to import:',
      [
        ...entry.phones.map((p) => ({
          text: existingPhoneSet.has(p.normalized)
            ? `${p.formatted} (${locale === 'pt-BR' ? 'já cadastrado' : 'already saved'})`
            : p.label
              ? `${p.formatted} (${p.label})`
              : p.formatted,
          onPress: () => {
            setPhoneChoiceMap((prev) => ({ ...prev, [entry.id]: p.normalized }));
            setSelectedMap((prev) => {
              if (existingPhoneSet.has(p.normalized)) {
                const next = { ...prev };
                delete next[entry.id];
                return next;
              }
              if (prev[entry.id]) {
                return { ...prev, [entry.id]: { name: entry.name, phone: p.normalized } };
              }
              return prev;
            });
          },
        })),
        { text: locale === 'pt-BR' ? 'Cancelar' : 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleSelectAllNew = () => {
    const next: Record<string, SelectedPhoneContact> = { ...selectedMap };
    const usedPhones = new Set<string>(Object.values(next).map((c) => c.phone));
    for (const entry of selectableFiltered) {
      const active = getActivePhone(entry);
      if (!existingPhoneSet.has(active.normalized) && !usedPhones.has(active.normalized)) {
        next[entry.id] = { name: entry.name, phone: active.normalized };
        usedPhones.add(active.normalized);
      }
    }
    setSelectedMap(next);
  };

  const handleClearSelection = () => {
    setSelectedMap({});
  };

  const renderItem = ({ item }: { item: DeviceContactEntry }) => {
    const activePhone = getActivePhone(item);
    const alreadyExists = existingPhoneSet.has(activePhone.normalized);
    const isSelected = Boolean(selectedMap[item.id]);
    const hasMultiplePhones = item.phones.length > 1;

    return (
      <Pressable
        onPress={() => (mode === 'single' ? handleSinglePress(item) : toggleBatchContact(item))}
        disabled={mode === 'batch' && alreadyExists}
        style={({ pressed }) => [
          styles.row,
          isSelected && styles.rowSelected,
          mode === 'batch' && alreadyExists && styles.rowDisabled,
          pressed && !(mode === 'batch' && alreadyExists) && styles.rowPressed,
        ]}
      >
        {mode === 'batch' ? (
          <View
            style={[
              styles.checkbox,
              isSelected && styles.checkboxChecked,
              alreadyExists && styles.checkboxDone,
            ]}
          >
            {alreadyExists ? (
              <CheckCircle2 size={15} color={colors.success} />
            ) : isSelected ? (
              <Check size={14} color={colors.textOnDark} strokeWidth={3} />
            ) : null}
          </View>
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {item.name
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase() ?? '')
                .join('') || 'C'}
            </Text>
          </View>
        )}

        <View style={styles.rowBody}>
          <View style={styles.nameLine}>
            <Text style={styles.contactName} numberOfLines={1}>
              {item.name}
            </Text>
            {alreadyExists ? (
              <View style={styles.savedPill}>
                <Text style={styles.savedPillText}>
                  {locale === 'pt-BR' ? 'Já cadastrado' : 'Already saved'}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.phoneLine}>
            <Phone size={12} color={colors.textMuted} />
            <Text style={styles.contactPhone}>{activePhone.formatted}</Text>
            {hasMultiplePhones ? (
              <Pressable
                onPress={() => handleCyclePhone(item)}
                hitSlop={6}
                style={styles.multiPhoneBadge}
              >
                <Text style={styles.multiPhoneText}>
                  +{item.phones.length - 1} {locale === 'pt-BR' ? 'núm.' : 'more'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
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
          {mode === 'single'
            ? locale === 'pt-BR'
              ? 'Escolher Contato'
              : 'Pick Contact'
            : locale === 'pt-BR'
              ? 'Importar Contatos'
              : 'Import Contacts'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {loadState === 'loading' ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
          <Text style={styles.centerSub}>
            {locale === 'pt-BR' ? 'Lendo agenda do celular...' : 'Reading device contacts...'}
          </Text>
        </View>
      ) : loadState === 'denied' ? (
        <View style={styles.centerBox}>
          <View style={styles.emptyIconCircle}>
            <BookUser size={26} color={colors.brandPrimary} />
          </View>
          <Text style={styles.emptyTitle}>
            {locale === 'pt-BR' ? 'Permissão de contatos negada' : 'Contacts permission denied'}
          </Text>
          <Text style={styles.centerSub}>
            {locale === 'pt-BR'
              ? 'Libere o acesso aos contatos para preencher nome e WhatsApp dos clientes sem digitar.'
              : 'Allow contacts access to quickly fill customer names and phone numbers.'}
          </Text>
          <View style={styles.centerActions}>
            {canAskAgain ? (
              <Button
                label={locale === 'pt-BR' ? 'Tentar novamente' : 'Try again'}
                fullWidth={false}
                onPress={handleRetryLoad}
              />
            ) : (
              <Button
                label={locale === 'pt-BR' ? 'Abrir Ajustes' : 'Open Settings'}
                fullWidth={false}
                icon={<Settings size={16} color={colors.textOnDark} />}
                onPress={() => void Linking.openSettings()}
              />
            )}
          </View>
        </View>
      ) : loadState === 'unsupported' ? (
        <View style={styles.centerBox}>
          <View style={styles.emptyIconCircle}>
            <BookUser size={26} color={colors.brandPrimary} />
          </View>
          <Text style={styles.emptyTitle}>
            {locale === 'pt-BR' ? 'Disponível no aplicativo móvel' : 'Available on mobile app'}
          </Text>
          <Text style={styles.centerSub}>
            {locale === 'pt-BR'
              ? 'A importação da agenda do celular funciona no app Android e iOS.'
              : 'Phone contact import is supported on Android and iOS devices.'}
          </Text>
        </View>
      ) : loadState === 'error' ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyTitle}>
            {locale === 'pt-BR' ? 'Erro ao ler agenda' : 'Unable to read contacts'}
          </Text>
          <Button
            label={locale === 'pt-BR' ? 'Tentar novamente' : 'Retry'}
            variant="secondary"
            fullWidth={false}
            onPress={handleRetryLoad}
          />
        </View>
      ) : (
        <>
          {/* Search + Batch Action Toolbar */}
          <View style={styles.toolbar}>
            <View style={styles.searchWrapper}>
              <Search size={17} color={colors.textMuted} />
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder={
                  locale === 'pt-BR'
                    ? 'Buscar contato por nome ou número...'
                    : 'Search contact by name or phone...'
                }
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
                autoCorrect={false}
              />
              {searchText.length > 0 ? (
                <Pressable onPress={() => setSearchText('')} hitSlop={8}>
                  <X size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            {mode === 'batch' ? (
              <View style={styles.batchMetaRow}>
                <Text style={styles.batchCountText}>
                  {selectableFiltered.length}{' '}
                  {locale === 'pt-BR' ? 'novos disponíveis' : 'new available'}
                </Text>
                <View style={styles.batchLinksRow}>
                  {selectedList.length > 0 ? (
                    <Pressable onPress={handleClearSelection} hitSlop={6}>
                      <Text style={styles.linkMuted}>
                        {locale === 'pt-BR' ? 'Limpar' : 'Clear'}
                      </Text>
                    </Pressable>
                  ) : null}
                  {selectableFiltered.length > 0 ? (
                    <Pressable onPress={handleSelectAllNew} hitSlop={6}>
                      <Text style={styles.linkPrimary}>
                        {locale === 'pt-BR' ? 'Selecionar novos' : 'Select new'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>

          <FlatList
            data={filteredContacts}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.centerBox}>
                <Text style={styles.emptyTitle}>
                  {locale === 'pt-BR' ? 'Nenhum contato encontrado' : 'No contacts found'}
                </Text>
                <Text style={styles.centerSub}>
                  {locale === 'pt-BR'
                    ? 'Apenas contatos com nome e número de telefone válido são exibidos.'
                    : 'Only contacts with a name and valid phone number are displayed.'}
                </Text>
              </View>
            }
          />

          {mode === 'batch' ? (
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
              <Button
                label={
                  selectedList.length === 0
                    ? locale === 'pt-BR'
                      ? 'Selecione contatos para importar'
                      : 'Select contacts to import'
                    : locale === 'pt-BR'
                      ? `Importar ${selectedList.length} ${selectedList.length === 1 ? 'contato' : 'contatos'}`
                      : `Import ${selectedList.length} ${selectedList.length === 1 ? 'contact' : 'contacts'}`
                }
                disabled={selectedList.length === 0}
                loading={batchImportMutation.isPending}
                onPress={() => batchImportMutation.mutate(selectedList)}
              />
            </View>
          ) : null}
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
  toolbar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: 10,
    backgroundColor: colors.bgCanvas,
  },
  searchWrapper: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  batchMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  batchCountText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  batchLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  linkPrimary: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: colors.brandPrimary,
  },
  linkMuted: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12.5,
    color: colors.textMuted,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: 24,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowSelected: {
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandPrimarySoft,
  },
  rowDisabled: {
    opacity: 0.65,
  },
  rowPressed: {
    borderColor: colors.brandPrimary,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brandPrimarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.brandPrimary,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandPrimary,
  },
  checkboxDone: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successSoft,
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactName: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  savedPill: {
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  savedPillText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10.5,
    color: colors.successDark,
  },
  phoneLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contactPhone: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  multiPhoneBadge: {
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  multiPhoneText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10.5,
    color: colors.brandPrimary,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 56,
    paddingHorizontal: 28,
    gap: 10,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandPrimarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 16,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  centerSub: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  centerActions: {
    marginTop: 8,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
});
