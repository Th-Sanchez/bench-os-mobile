import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Phone, StickyNote, Trash2, User, X } from 'lucide-react-native';
import { customersApi } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { CustomerResponse } from '@/types/api';

interface CustomerFormModalProps {
  visible: boolean;
  customer?: CustomerResponse | null;
  onClose: () => void;
  onSaved?: (customer: CustomerResponse) => void;
}

export function CustomerFormModal({
  visible,
  customer,
  onClose,
  onSaved,
}: CustomerFormModalProps) {
  const { session } = useAuth();
  const { locale, formatPhone } = useI18n();
  const queryClient = useQueryClient();

  const isEditing = Boolean(customer);
  const canDelete =
    isEditing &&
    (session?.user.role === 'OWNER' || session?.user.role === 'ATTENDANT');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [document, setDocument] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(customer?.name ?? '');
      setPhone(customer ? formatPhone(customer.phone) : '');
      setDocument(customer?.document ?? '');
      setNotes(customer?.notes ?? '');
      setErrorMsg(null);
    }
  }, [visible, customer, formatPhone]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        document: document.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      return customer
        ? customersApi.update(customer.id, payload)
        : customersApi.create(payload);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      onSaved?.(saved);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg(
          locale === 'pt-BR'
            ? 'Erro ao salvar cliente. Tente novamente.'
            : 'Failed to save customer.'
        );
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => customersApi.remove(customer!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
    onError: (err) => {
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to delete customer');
    },
  });

  const handleSave = () => {
    setErrorMsg(null);
    if (!name.trim() || !phone.trim()) {
      setErrorMsg(
        locale === 'pt-BR'
          ? 'Nome e telefone são obrigatórios.'
          : 'Name and phone are required.'
      );
      return;
    }
    saveMutation.mutate();
  };

  const handleDeleteConfirm = () => {
    Alert.alert(
      locale === 'pt-BR' ? 'Remover cliente?' : 'Remove customer?',
      locale === 'pt-BR'
        ? 'O cliente será ocultado das buscas, mas o histórico de OS antigas será preservado.'
        : 'The customer will be hidden from search, while past service orders remain preserved.',
      [
        { text: locale === 'pt-BR' ? 'Cancelar' : 'Cancel', style: 'cancel' },
        {
          text: locale === 'pt-BR' ? 'Remover' : 'Remove',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
            <X size={20} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>
            {isEditing
              ? locale === 'pt-BR'
                ? 'Editar Cliente'
                : 'Edit Customer'
              : locale === 'pt-BR'
                ? 'Novo Cliente'
                : 'New Customer'}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {errorMsg ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          <TextField
            label={locale === 'pt-BR' ? 'Nome completo *' : 'Full name *'}
            placeholder="Ex: Maria Silva"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            leftIcon={<User size={16} color={colors.textMuted} />}
          />

          <TextField
            label={locale === 'pt-BR' ? 'Telefone / WhatsApp *' : 'Phone / WhatsApp *'}
            placeholder="(11) 98888-1234"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            mono
            leftIcon={<Phone size={16} color={colors.textMuted} />}
          />

          <TextField
            label={locale === 'pt-BR' ? 'CPF / CNPJ (opcional)' : 'Document / Tax ID (optional)'}
            placeholder="000.000.000-00"
            value={document}
            onChangeText={setDocument}
            keyboardType="numeric"
            mono
            leftIcon={<FileText size={16} color={colors.textMuted} />}
          />

          <TextField
            label={locale === 'pt-BR' ? 'Observações (opcional)' : 'Notes (optional)'}
            placeholder={
              locale === 'pt-BR'
                ? 'Ex: Prefere contato por WhatsApp'
                : 'e.g. Prefers WhatsApp messages'
            }
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            style={styles.notesInput}
            leftIcon={<StickyNote size={16} color={colors.textMuted} />}
          />

          {canDelete ? (
            <Button
              label={locale === 'pt-BR' ? 'Remover cliente' : 'Remove customer'}
              variant="dangerOutline"
              onPress={handleDeleteConfirm}
              loading={deleteMutation.isPending}
              icon={<Trash2 size={16} color={colors.danger} />}
              style={styles.deleteBtn}
            />
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={
              isEditing
                ? locale === 'pt-BR'
                  ? 'Salvar alterações'
                  : 'Save changes'
                : locale === 'pt-BR'
                  ? 'Cadastrar cliente'
                  : 'Create customer'
            }
            onPress={handleSave}
            loading={saveMutation.isPending}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  body: {
    padding: spacing.lg,
    gap: 16,
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
  notesInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  deleteBtn: {
    marginTop: 8,
  },
  footer: {
    padding: spacing.lg,
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
});
