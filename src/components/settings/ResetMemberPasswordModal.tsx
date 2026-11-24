import React, { useState } from 'react';
import {
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
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, KeyRound, Lock, X } from 'lucide-react-native';
import { usersApi } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { UserResponse } from '@/types/api';

interface ResetMemberPasswordModalProps {
  visible: boolean;
  member: UserResponse | null;
  onClose: () => void;
}

export function ResetMemberPasswordModal({
  visible,
  member,
  onClose,
}: ResetMemberPasswordModalProps) {
  if (!member) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible ? (
        <ResetMemberPasswordBody key={member.id} member={member} onClose={onClose} />
      ) : null}
    </Modal>
  );
}

function ResetMemberPasswordBody({
  member,
  onClose,
}: {
  member: UserResponse;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardVisible();
  const { locale, t } = useI18n();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetMutation = useMutation({
    mutationFn: () => usersApi.resetPassword(member.id, newPassword),
    onSuccess: () => {
      onClose();
      Alert.alert(
        locale === 'pt-BR' ? 'Senha redefinida!' : 'Password updated!',
        locale === 'pt-BR'
          ? `A nova senha de ${member.name} já está ativa. Compartilhe o acesso com o colaborador.`
          : `${member.name}'s new password is now active. Share it with your team member.`
      );
    },
    onError: (err) => {
      setErrorMessage(err instanceof ApiError ? err.message : t.common.errorGeneric);
    },
  });

  const handleSubmit = () => {
    setErrorMessage(null);
    if (newPassword.length < 8) {
      setErrorMessage(
        locale === 'pt-BR'
          ? 'A nova senha deve ter pelo menos 8 caracteres.'
          : 'New password must be at least 8 characters.'
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage(
        locale === 'pt-BR' ? 'As senhas não coincidem.' : 'Passwords do not match.'
      );
      return;
    }
    resetMutation.mutate();
  };

  return (
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
            <KeyRound size={18} color={colors.brandPrimary} />
            <Text style={styles.title}>
              {locale === 'pt-BR' ? 'Redefinir senha do membro' : 'Reset member password'}
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
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.memberCard}>
            <Text style={styles.memberName}>{member.name}</Text>
            <Text style={styles.memberMeta}>
              {member.email} · {t.role[member.role]}
            </Text>
          </View>

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <TextField
            label={locale === 'pt-BR' ? 'Nova senha' : 'New password'}
            placeholder={locale === 'pt-BR' ? 'Mínimo 8 caracteres' : 'Min. 8 characters'}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            mono
            leftIcon={<Lock size={16} color={colors.textMuted} />}
            rightElement={
              <Pressable onPress={() => setShowPassword((prev) => !prev)} hitSlop={8}>
                {showPassword ? (
                  <EyeOff size={16} color={colors.textMuted} />
                ) : (
                  <Eye size={16} color={colors.textMuted} />
                )}
              </Pressable>
            }
          />

          <TextField
            label={locale === 'pt-BR' ? 'Confirmar nova senha' : 'Confirm new password'}
            placeholder="••••••••"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            mono
            leftIcon={<Lock size={16} color={colors.textMuted} />}
          />

          <View style={styles.actions}>
            <Button
              label={t.common.cancel}
              variant="secondary"
              onPress={onClose}
              style={styles.actionBtn}
            />
            <Button
              label={locale === 'pt-BR' ? 'Salvar senha' : 'Save password'}
              loading={resetMutation.isPending}
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
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  body: {
    gap: 14,
    paddingBottom: 8,
  },
  memberCard: {
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: 12,
    gap: 2,
  },
  memberName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14.5,
    color: colors.textPrimary,
  },
  memberMeta: {
    fontFamily: fonts.monoMedium,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.dangerDark,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
  },
});
