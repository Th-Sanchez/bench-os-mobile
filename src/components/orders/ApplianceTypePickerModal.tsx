import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Pencil, Plus, Search, X } from 'lucide-react-native';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

function normalizeToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

interface ApplianceTypePickerModalProps {
  visible: boolean;
  selectedValue: string;
  options: string[];
  allowOther?: boolean;
  onSelect: (value: string) => void;
  onCreateNew?: (name: string) => void;
  isCreating?: boolean;
  onClose: () => void;
}

export function ApplianceTypePickerModal(props: ApplianceTypePickerModalProps) {
  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="slide"
      onRequestClose={props.onClose}
    >
      {props.visible ? <ApplianceTypePickerBody {...props} /> : null}
    </Modal>
  );
}

function ApplianceTypePickerBody({
  selectedValue,
  options,
  allowOther = true,
  onSelect,
  onCreateNew,
  isCreating = false,
  onClose,
}: ApplianceTypePickerModalProps) {
  const { locale } = useI18n();
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardVisible();
  const [query, setQuery] = useState('');

  const trimmedQuery = query.trim();
  const normalizedQuery = normalizeToken(trimmedQuery);

  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options;
    return options.filter((opt) => {
      const normalizedOpt = normalizeToken(opt);
      const compactOpt = normalizedOpt.replace(/\s+/g, '');
      const compactQuery = normalizedQuery.replace(/\s+/g, '');
      return normalizedOpt.includes(normalizedQuery) || compactOpt.includes(compactQuery);
    });
  }, [options, normalizedQuery]);

  const hasExactMatch = useMemo(() => {
    if (!normalizedQuery) return true;
    return options.some((opt) => normalizeToken(opt) === normalizedQuery);
  }, [options, normalizedQuery]);

  const handleSelect = (value: string) => {
    onSelect(value);
    onClose();
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.backdrop,
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

      <View
        style={[
          styles.sheet,
          {
            paddingBottom: isKeyboardVisible
              ? spacing.md
              : Math.max(insets.bottom + spacing.md, spacing.xl),
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>
            {locale === 'pt-BR' ? 'Tipo de aparelho' : 'Appliance type'}
          </Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <X size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <View style={styles.searchBox}>
            <Search size={16} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={
                locale === 'pt-BR'
                  ? 'Buscar ou digitar novo tipo...'
                  : 'Search or type a new category...'
              }
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <X size={15} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.scrollBody}
        >
          {onCreateNew && trimmedQuery.length >= 2 && !hasExactMatch ? (
            <Pressable
              disabled={isCreating}
              onPress={() => onCreateNew(trimmedQuery)}
              style={({ pressed }) => [
                styles.createRow,
                pressed && { opacity: 0.85 },
                isCreating && { opacity: 0.6 },
              ]}
            >
              {isCreating ? (
                <ActivityIndicator size="small" color={colors.brandPrimary} />
              ) : (
                <Plus size={16} color={colors.brandPrimary} strokeWidth={2.4} />
              )}
              <Text style={styles.createRowText} numberOfLines={1}>
                {locale === 'pt-BR'
                  ? `Salvar "${trimmedQuery}" nos tipos da oficina`
                  : `Save "${trimmedQuery}" as a shop category`}
              </Text>
            </Pressable>
          ) : null}

          {filteredOptions.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                {locale === 'pt-BR'
                  ? 'Nenhum aparelho encontrado na lista.'
                  : 'No matching appliance found.'}
              </Text>
              <Text style={styles.emptySub}>
                {locale === 'pt-BR'
                  ? 'Salve o nome digitado acima ou escolha "Outro (digitar manualmente)" abaixo.'
                  : 'Save the typed name above or pick "Other (type manually)" below.'}
              </Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {filteredOptions.map((option) => {
                const active = selectedValue === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => handleSelect(option)}
                    style={({ pressed }) => [
                      styles.gridTile,
                      active && styles.gridTileActive,
                      pressed && !active && styles.gridTilePressed,
                    ]}
                  >
                    <Text
                      style={[styles.gridTileText, active && styles.gridTileTextActive]}
                      numberOfLines={2}
                    >
                      {option}
                    </Text>
                    {active ? (
                      <Check size={15} color={colors.brandPrimary} strokeWidth={2.5} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}

          {allowOther ? (
            <Pressable
              onPress={() => handleSelect('Outro')}
              style={({ pressed }) => [
                styles.otherRow,
                selectedValue === 'Outro' && styles.gridTileActive,
                pressed && selectedValue !== 'Outro' && styles.gridTilePressed,
              ]}
            >
              <View style={styles.otherLeft}>
                <Pencil
                  size={15}
                  color={selectedValue === 'Outro' ? colors.brandPrimary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.otherText,
                    selectedValue === 'Outro' && styles.gridTileTextActive,
                  ]}
                >
                  {locale === 'pt-BR'
                    ? 'Outro (digitar manualmente)'
                    : 'Other (type manually)'}
                </Text>
              </View>
              {selectedValue === 'Outro' ? (
                <Check size={15} color={colors.brandPrimary} strokeWidth={2.5} />
              ) : null}
            </Pressable>
          ) : null}
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
    maxHeight: '88%',
    flexShrink: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchBox: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 8,
  },
  scrollBody: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  createRowText: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.brandPrimary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridTile: {
    width: '48.5%',
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  gridTileActive: {
    backgroundColor: colors.brandPrimarySoft,
    borderColor: colors.brandPrimary,
  },
  gridTilePressed: {
    backgroundColor: colors.bgSubtle,
  },
  gridTileText: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  gridTileTextActive: {
    fontFamily: fonts.bodySemiBold,
    color: colors.brandPrimary,
  },
  otherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 46,
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  otherLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  otherText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: 4,
  },
  emptyText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13.5,
    color: colors.textPrimary,
  },
  emptySub: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
