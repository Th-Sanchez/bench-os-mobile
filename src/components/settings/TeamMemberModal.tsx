import React, { useState } from 'react';
import {
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
import { Eye, EyeOff, UserPlus, X } from 'lucide-react-native';
import { usersApi } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { CreateUserRequest, Role } from '@/types/api';

const ASSIGNABLE_ROLES: Role[] = ['TECHNICIAN', 'ATTENDANT', 'OWNER'];

interface TeamMemberModalProps {
  visible: boolean;
  onClose: () => void;
}

export function TeamMemberModal({ visible, onClose }: TeamMemberModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible ? <TeamMemberBody onClose={onClose} /> : null}
    </Modal>
  );
}

function TeamMemberBody({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<Role>('TECHNICIAN');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (payload: CreateUserRequest) => usersApi.create(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['team-users'] });
      onClose();
    },
    onError: (err) => {
      setErrorMessage(err instanceof Error ? err.message : t.common.errorGeneric);
    },
  });

  const handleSubmit = () => {
    setErrorMessage(null);
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      setErrorMessage(
        locale === 'pt-BR' ? 'Informe o nome do colaborador.' : 'Enter the member name.'
      );
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage(
        locale === 'pt-BR' ? 'Informe um e-mail válido.' : 'Enter a valid email address.'
      );
      return;
    }
    if (password.length < 6) {
      setErrorMessage(
        locale === 'pt-BR'
          ? 'A senha inicial deve ter pelo menos 6 caracteres.'
          : 'Initial password must be at least 6 characters.'
      );
      return;
    }

    createMutation.mutate({
      name: trimmedName,
      email: trimmedEmail,
      password,
      role,
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.backdrop}
    >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <UserPlus size={18} color={colors.brandPrimary} />
              <Text style={styles.title}>
                {locale === 'pt-BR' ? 'Novo membro da equipe' : 'New team member'}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            <TextField
              label={locale === 'pt-BR' ? 'Nome completo' : 'Full name'}
              value={name}
              onChangeText={setName}
              placeholder={locale === 'pt-BR' ? 'Ex: Lucas Rocha' : 'e.g. Lucas Rocha'}
              autoCapitalize="words"
            />

            <TextField
              label={t.auth.emailLabel}
              value={email}
              onChangeText={setEmail}
              placeholder="tecnico@oficina.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextField
              label={locale === 'pt-BR' ? 'Senha inicial' : 'Initial password'}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              rightElement={
                <Pressable
                  onPress={() => setShowPassword((prev) => !prev)}
                  hitSlop={8}
                >
                  {showPassword ? (
                    <EyeOff size={18} color={colors.textMuted} />
                  ) : (
                    <Eye size={18} color={colors.textMuted} />
                  )}
                </Pressable>
              }
            />

            <View style={styles.roleSection}>
              <Text style={styles.roleLabel}>
                {locale === 'pt-BR' ? 'Perfil de acesso' : 'Access role'}
              </Text>
              <View style={styles.roleRow}>
                {ASSIGNABLE_ROLES.map((itemRole) => {
                  const active = role === itemRole;
                  return (
                    <Pressable
                      key={itemRole}
                      onPress={() => setRole(itemRole)}
                      style={[styles.roleChip, active && styles.roleChipActive]}
                    >
                      <Text style={[styles.roleChipText, active && styles.roleChipTextActive]}>
                        {t.role[itemRole]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.roleHint}>
                {role === 'OWNER'
                  ? locale === 'pt-BR'
                    ? 'Acesso total: bancada, financeiro, equipe e configurações.'
                    : 'Full access: workbench, finance, team, and settings.'
                  : role === 'ATTENDANT'
                    ? locale === 'pt-BR'
                      ? 'Atendimento, abertura de OS, clientes e entrega (sem financeiro).'
                      : 'Front desk, order intake, customers, and delivery (no finance).'
                    : locale === 'pt-BR'
                      ? 'Diagnóstico, fotos, orçamentos e bancada técnica (sem financeiro).'
                      : 'Diagnostics, photos, quotes, and workbench (no finance).'}
              </Text>
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <View style={styles.actions}>
              <Button
                label={t.common.cancel}
                variant="secondary"
                onPress={onClose}
                style={styles.actionBtn}
              />
              <Button
                label={locale === 'pt-BR' ? 'Criar acesso' : 'Create user'}
                loading={createMutation.isPending}
                onPress={handleSubmit}
                style={styles.actionBtn}
              />
            </View>
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
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
  body: {
    gap: 14,
    paddingBottom: 10,
  },
  roleSection: {
    gap: 8,
  },
  roleLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roleChip: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgCanvas,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  roleChipActive: {
    backgroundColor: colors.brandPrimarySoft,
    borderColor: colors.brandPrimary,
  },
  roleChipText: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    color: colors.textSecondary,
  },
  roleChipTextActive: {
    color: colors.brandPrimary,
  },
  roleHint: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  errorText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.danger,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  actionBtn: {
    flex: 1,
  },
});
