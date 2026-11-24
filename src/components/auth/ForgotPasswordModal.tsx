import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck, X } from 'lucide-react-native';
import { authApi } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import { maskInteger } from '@/utils/masks';

interface ForgotPasswordModalProps {
  visible: boolean;
  initialEmail?: string;
  onClose: () => void;
  onSuccess: (email: string) => void;
}

type Step = 'email' | 'reset';

export function ForgotPasswordModal({
  visible,
  initialEmail = '',
  onClose,
  onSuccess,
}: ForgotPasswordModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible ? (
        <ForgotPasswordBody
          initialEmail={initialEmail}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      ) : null}
    </Modal>
  );
}

function ForgotPasswordBody({
  initialEmail,
  onClose,
  onSuccess,
}: Omit<ForgotPasswordModalProps, 'visible'>) {
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardVisible();
  const { locale, t } = useI18n();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState((initialEmail ?? '').trim());
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const handleRequestCode = async (isResend = false) => {
    setErrorMessage(null);
    setInfoMessage(null);
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage(
        locale === 'pt-BR' ? 'Informe um e-mail válido.' : 'Please enter a valid email address.'
      );
      return;
    }

    if (isResend) setResending(true);
    else setSubmitting(true);

    try {
      await authApi.forgotPassword({ email: trimmedEmail });
      setEmail(trimmedEmail);
      setStep('reset');
      setCooldownSeconds(60);
      setInfoMessage(
        locale === 'pt-BR'
          ? 'Se o e-mail estiver cadastrado, enviamos um código de 6 dígitos (válido por 15 min).'
          : 'If this email is registered, we sent a 6-digit verification code (valid for 15 min).'
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage(t.common.errorGeneric);
      }
    } finally {
      setSubmitting(false);
      setResending(false);
    }
  };

  const handleResetPassword = async () => {
    setErrorMessage(null);
    const cleanCode = maskInteger(code, 6);

    if (cleanCode.length !== 6) {
      setErrorMessage(
        locale === 'pt-BR'
          ? 'Digite o código de 6 dígitos enviado para o seu e-mail.'
          : 'Enter the 6-digit code sent to your email.'
      );
      return;
    }
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

    setSubmitting(true);
    try {
      await authApi.resetPassword({
        email: email.trim().toLowerCase(),
        code: cleanCode,
        newPassword,
      });
      onSuccess(email.trim().toLowerCase());
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 422) {
          setErrorMessage(
            locale === 'pt-BR'
              ? 'Código inválido ou expirado. Verifique o e-mail ou solicite um novo código.'
              : 'Invalid or expired verification code. Please check your email or request a new one.'
          );
        } else {
          setErrorMessage(err.message);
        }
      } else {
        setErrorMessage(t.common.errorGeneric);
      }
    } finally {
      setSubmitting(false);
    }
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
              {locale === 'pt-BR' ? 'Recuperar senha' : 'Reset password'}
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
          {step === 'email' ? (
            <>
              <Text style={styles.description}>
                {locale === 'pt-BR'
                  ? 'Informe o e-mail da sua conta. Enviaremos um código de 6 dígitos para você criar uma nova senha.'
                  : 'Enter your account email. We will send a 6-digit code so you can set a new password.'}
              </Text>

              {errorMessage ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              <TextField
                label={t.auth.emailLabel}
                placeholder="carlos@oficina.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                mono
                leftIcon={<Mail size={16} color={colors.textMuted} />}
              />

              <View style={styles.actions}>
                <Button
                  label={t.common.cancel}
                  variant="secondary"
                  onPress={onClose}
                  style={styles.actionBtn}
                />
                <Button
                  label={locale === 'pt-BR' ? 'Enviar código' : 'Send code'}
                  loading={submitting}
                  onPress={() => void handleRequestCode(false)}
                  style={styles.actionBtn}
                />
              </View>
            </>
          ) : (
            <>
              <View style={styles.emailSummaryRow}>
                <View style={styles.emailSummaryLeft}>
                  <Mail size={14} color={colors.brandPrimary} />
                  <Text style={styles.emailSummaryText} numberOfLines={1}>
                    {email}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setStep('email');
                    setErrorMessage(null);
                    setInfoMessage(null);
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.changeLink}>
                    {locale === 'pt-BR' ? 'Alterar' : 'Change'}
                  </Text>
                </Pressable>
              </View>

              {infoMessage ? (
                <View style={styles.infoBanner}>
                  <Text style={styles.infoText}>{infoMessage}</Text>
                </View>
              ) : null}

              {errorMessage ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              <TextField
                label={locale === 'pt-BR' ? 'Código de 6 dígitos' : '6-digit code'}
                placeholder="000000"
                value={code}
                onChangeText={(val) => setCode(maskInteger(val, 6))}
                keyboardType="number-pad"
                maxLength={6}
                mono
                style={styles.codeInput}
                leftIcon={<ShieldCheck size={16} color={colors.textMuted} />}
              />

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

              <View style={styles.resendRow}>
                <Text style={styles.resendLabel}>
                  {locale === 'pt-BR' ? 'Não recebeu o código?' : "Didn't receive the code?"}
                </Text>
                <Pressable
                  disabled={cooldownSeconds > 0 || resending}
                  onPress={() => void handleRequestCode(true)}
                  hitSlop={8}
                >
                  <Text
                    style={[
                      styles.resendLink,
                      (cooldownSeconds > 0 || resending) && styles.resendLinkDisabled,
                    ]}
                  >
                    {cooldownSeconds > 0
                      ? locale === 'pt-BR'
                        ? `Reenviar em ${cooldownSeconds}s`
                        : `Resend in ${cooldownSeconds}s`
                      : locale === 'pt-BR'
                        ? 'Reenviar código'
                        : 'Resend code'}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.actions}>
                <Button
                  label={t.common.cancel}
                  variant="secondary"
                  onPress={onClose}
                  style={styles.actionBtn}
                />
                <Button
                  label={locale === 'pt-BR' ? 'Redefinir senha' : 'Reset password'}
                  loading={submitting}
                  onPress={() => void handleResetPassword()}
                  style={styles.actionBtn}
                />
              </View>
            </>
          )}
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
    maxHeight: '90%',
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
  },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  body: {
    gap: 14,
    paddingBottom: 8,
  },
  description: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  emailSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  emailSummaryLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emailSummaryText: {
    flex: 1,
    fontFamily: fonts.monoMedium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  changeLink: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: colors.brandPrimary,
  },
  infoBanner: {
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  infoText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.infoDark,
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
    lineHeight: 17,
    color: colors.dangerDark,
  },
  codeInput: {
    fontSize: 20,
    letterSpacing: 6,
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  resendLabel: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12.5,
    color: colors.textMuted,
  },
  resendLink: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: colors.brandPrimary,
  },
  resendLinkDisabled: {
    color: colors.textMuted,
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
