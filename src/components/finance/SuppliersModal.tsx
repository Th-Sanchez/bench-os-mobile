import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { Building2, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import { financeApi } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { SupplierResponse, UpsertSupplierRequest } from '@/types/api';
import { maskPhoneBR, unmaskDigits } from '@/utils/masks';

interface SuppliersModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SuppliersModal({ visible, onClose }: SuppliersModalProps) {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardVisible();
  const { locale, t, formatPhone } = useI18n();

  const [editing, setEditing] = useState<SupplierResponse | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const suppliersQuery = useQuery({
    queryKey: ['finance-suppliers'],
    queryFn: () => financeApi.listSuppliers(),
    enabled: visible,
  });

  const resetForm = () => {
    setEditing(null);
    setShowForm(false);
    setName('');
    setPhone('');
    setNotes('');
    setErrorMessage(null);
  };

  const openCreate = () => {
    setEditing(null);
    setName('');
    setPhone('');
    setNotes('');
    setErrorMessage(null);
    setShowForm(true);
  };

  const openEdit = (supplier: SupplierResponse) => {
    setEditing(supplier);
    setName(supplier.name);
    setPhone(supplier.phone ? maskPhoneBR(supplier.phone) : '');
    setNotes(supplier.notes ?? '');
    setErrorMessage(null);
    setShowForm(true);
  };

  const saveMutation = useMutation({
    mutationFn: (payload: UpsertSupplierRequest) =>
      editing
        ? financeApi.updateSupplier(editing.id, payload)
        : financeApi.createSupplier(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['finance-suppliers'] });
      resetForm();
    },
    onError: (err) => {
      setErrorMessage(err instanceof Error ? err.message : t.common.errorGeneric);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => financeApi.deleteSupplier(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['finance-suppliers'] });
    },
  });

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage(
        locale === 'pt-BR' ? 'Informe o nome do fornecedor.' : 'Enter the supplier name.'
      );
      return;
    }
    const phoneDigits = unmaskDigits(phone);
    if (phoneDigits.length > 0 && phoneDigits.length < 8) {
      setErrorMessage(
        locale === 'pt-BR'
          ? 'Informe um telefone válido com DDD ou deixe em branco.'
          : 'Enter a valid phone number or leave it blank.'
      );
      return;
    }
    setErrorMessage(null);
    saveMutation.mutate({
      name: trimmedName,
      phone: phoneDigits || undefined,
      notes: notes.trim() || undefined,
    });
  };

  const confirmDelete = (supplier: SupplierResponse) => {
    Alert.alert(
      locale === 'pt-BR' ? 'Remover fornecedor' : 'Remove supplier',
      locale === 'pt-BR'
        ? `Deseja remover "${supplier.name}"? Lançamentos anteriores continuam preservados.`
        : `Remove "${supplier.name}"? Previous transactions will be preserved.`,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.remove,
          style: 'destructive',
          onPress: () => deleteMutation.mutate(supplier.id),
        },
      ]
    );
  };

  const suppliers = suppliersQuery.data ?? [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
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
            <View style={styles.titleRow}>
              <Building2 size={18} color={colors.brandPrimary} />
              <Text style={styles.title}>
                {locale === 'pt-BR' ? 'Fornecedores' : 'Suppliers'}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                resetForm();
                onClose();
              }}
              hitSlop={10}
            >
              <X size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          {showForm ? (
            <ScrollView
              contentContainerStyle={styles.formBody}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.sectionHeading}>
                {editing
                  ? locale === 'pt-BR'
                    ? 'Editar fornecedor'
                    : 'Edit supplier'
                  : locale === 'pt-BR'
                    ? 'Novo fornecedor'
                    : 'New supplier'}
              </Text>

              <TextField
                label={locale === 'pt-BR' ? 'Nome' : 'Name'}
                value={name}
                onChangeText={setName}
                placeholder={locale === 'pt-BR' ? 'Ex: Casa das Peças' : 'e.g. Parts Warehouse'}
              />

              <TextField
                label={locale === 'pt-BR' ? 'Telefone / WhatsApp (opcional)' : 'Phone (optional)'}
                value={phone}
                onChangeText={(val) => setPhone(maskPhoneBR(val))}
                placeholder="(11) 99999-0000"
                keyboardType="phone-pad"
                maxLength={15}
                mono
              />

              <TextField
                label={locale === 'pt-BR' ? 'Observações (opcional)' : 'Notes (optional)'}
                value={notes}
                onChangeText={setNotes}
                placeholder={
                  locale === 'pt-BR'
                    ? 'Ex: Fecha fiado todo dia 10'
                    : 'e.g. Monthly billing on the 10th'
                }
              />

              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

              <View style={styles.formActions}>
                <Button
                  label={t.common.cancel}
                  variant="secondary"
                  onPress={resetForm}
                  style={styles.actionBtn}
                />
                <Button
                  label={t.common.save}
                  loading={saveMutation.isPending}
                  onPress={handleSave}
                  style={styles.actionBtn}
                />
              </View>
            </ScrollView>
          ) : (
            <>
              <Button
                label={locale === 'pt-BR' ? 'Cadastrar fornecedor' : 'Add supplier'}
                variant="dashed"
                icon={<Plus size={16} color={colors.brandPrimary} />}
                onPress={openCreate}
              />

              {suppliersQuery.isLoading ? (
                <View style={styles.centerBox}>
                  <ActivityIndicator color={colors.brandPrimary} />
                </View>
              ) : suppliers.length === 0 ? (
                <View style={styles.centerBox}>
                  <Text style={styles.emptyText}>
                    {locale === 'pt-BR'
                      ? 'Nenhum fornecedor cadastrado ainda.'
                      : 'No suppliers registered yet.'}
                  </Text>
                </View>
              ) : (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.listContent}
                >
                  {suppliers.map((sup) => (
                    <View key={sup.id} style={styles.supplierRow}>
                      <View style={styles.supplierInfo}>
                        <Text style={styles.supplierName} numberOfLines={1}>
                          {sup.name}
                        </Text>
                        {sup.phone ? (
                          <Text style={styles.supplierPhone}>{formatPhone(sup.phone)}</Text>
                        ) : null}
                        {sup.notes ? (
                          <Text style={styles.supplierNotes} numberOfLines={1}>
                            {sup.notes}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.rowActions}>
                        <Pressable
                          onPress={() => openEdit(sup)}
                          hitSlop={8}
                          style={styles.iconBtn}
                        >
                          <Pencil size={15} color={colors.textSecondary} />
                        </Pressable>
                        <Pressable
                          onPress={() => confirmDelete(sup)}
                          hitSlop={8}
                          style={styles.iconBtn}
                        >
                          <Trash2 size={15} color={colors.danger} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
    maxHeight: '85%',
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  sectionHeading: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textSecondary,
  },
  formBody: {
    gap: 12,
    paddingBottom: 12,
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  actionBtn: {
    flex: 1,
  },
  errorText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.danger,
  },
  centerBox: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textMuted,
  },
  listContent: {
    gap: 8,
    paddingBottom: 12,
  },
  supplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: 12,
  },
  supplierInfo: {
    flex: 1,
    gap: 2,
  },
  supplierName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  supplierPhone: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  supplierNotes: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textMuted,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 6,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
