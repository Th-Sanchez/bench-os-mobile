import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  FileText,
  Lock,
  Mail,
  Phone,
  User,
  Wrench,
} from 'lucide-react-native';
import { ApiError } from '@/api/http';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

type AuthMode = 'login' | 'register';

export default function LoginScreen() {
  const { signIn, registerShop } = useAuth();
  const { t, locale, setLocale } = useI18n();

  const [mode, setMode] = useState<AuthMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Login & shared fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register fields
  const [shopName, setShopName] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [ownerName, setOwnerName] = useState('');

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMessage(null);
  };

  const handleSubmit = async () => {
    setErrorMessage(null);

    if (!email.trim() || !password.trim()) {
      setErrorMessage(
        locale === 'pt-BR'
          ? 'Preencha seu e-mail e senha para continuar.'
          : 'Please enter your email and password.'
      );
      return;
    }

    if (mode === 'register') {
      if (!shopName.trim() || !document.trim() || !phone.trim() || !ownerName.trim()) {
        setErrorMessage(
          locale === 'pt-BR'
            ? 'Preencha todos os dados da oficina e do responsável.'
            : 'Please fill out all shop and owner fields.'
        );
        return;
      }
      if (password.length < 8) {
        setErrorMessage(
          locale === 'pt-BR'
            ? 'A senha deve ter pelo menos 8 caracteres.'
            : 'Password must be at least 8 characters.'
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await signIn({ email: email.trim(), password });
      } else {
        await registerShop({
          shopName: shopName.trim(),
          document: document.trim(),
          phone: phone.trim(),
          ownerName: ownerName.trim(),
          email: email.trim(),
          password,
        });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.problem?.errors) {
          const firstFieldError = Object.values(err.problem.errors)[0];
          setErrorMessage(firstFieldError || err.message);
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

  const handleForgotPassword = () => {
    Alert.alert(
      locale === 'pt-BR' ? 'Recuperação de senha' : 'Password recovery',
      locale === 'pt-BR'
        ? 'Peça ao proprietário (OWNER) da oficina para redefinir seu acesso ou entre em contato com o suporte BenchOS.'
        : 'Ask your shop OWNER to reset your access or contact BenchOS support.'
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand Mark & Wordmark */}
          <View style={styles.brandBlock}>
            <View style={styles.brandIconHalo}>
              <View style={styles.brandIconBox}>
                <Wrench size={26} color={colors.textOnDark} strokeWidth={2.2} />
              </View>
            </View>
            <Text style={styles.wordmark}>BenchOS</Text>
            <Text style={styles.tagline}>{t.auth.tagline}</Text>
          </View>

          {/* Segmented Mode Toggle */}
          <View style={styles.segmentedContainer}>
            <Pressable
              onPress={() => switchMode('login')}
              style={[styles.segmentBtn, mode === 'login' && styles.segmentBtnActive]}
            >
              <Text style={[styles.segmentText, mode === 'login' && styles.segmentTextActive]}>
                {t.auth.signInTab}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => switchMode('register')}
              style={[styles.segmentBtn, mode === 'register' && styles.segmentBtnActive]}
            >
              <Text style={[styles.segmentText, mode === 'register' && styles.segmentTextActive]}>
                {t.auth.registerTab}
              </Text>
            </Pressable>
          </View>

          {/* Main Auth Card */}
          <Card style={styles.authCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                {mode === 'login' ? t.auth.loginTitle : t.auth.registerTitle}
              </Text>
              <Text style={styles.cardSubtitle}>
                {mode === 'login' ? t.auth.loginSubtitle : t.auth.registerSubtitle}
              </Text>
            </View>

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={styles.formFields}>
              {mode === 'register' ? (
                <>
                  <TextField
                    label={t.auth.shopNameLabel}
                    placeholder="Ex: Oficina do Pai"
                    value={shopName}
                    onChangeText={setShopName}
                    autoCapitalize="words"
                    leftIcon={<Building2 size={16} color={colors.textMuted} />}
                  />
                  <TextField
                    label={t.auth.documentLabel}
                    placeholder="12.345.678/0001-01"
                    value={document}
                    onChangeText={setDocument}
                    keyboardType="numeric"
                    mono
                    leftIcon={<FileText size={16} color={colors.textMuted} />}
                  />
                  <TextField
                    label={t.auth.phoneLabel}
                    placeholder="(11) 99999-0001"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    mono
                    leftIcon={<Phone size={16} color={colors.textMuted} />}
                  />
                  <TextField
                    label={t.auth.ownerNameLabel}
                    placeholder="Carlos Silva"
                    value={ownerName}
                    onChangeText={setOwnerName}
                    autoCapitalize="words"
                    leftIcon={<User size={16} color={colors.textMuted} />}
                  />
                </>
              ) : null}

              <TextField
                label={t.auth.emailLabel}
                placeholder="carlos@oficinadopai.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                mono
                leftIcon={<Mail size={16} color={colors.textMuted} />}
              />

              <View style={styles.passwordGroup}>
                <View style={styles.passwordLabelRow}>
                  <Text style={styles.passwordLabel}>{t.auth.passwordLabel}</Text>
                  {mode === 'login' ? (
                    <Pressable onPress={handleForgotPassword} hitSlop={8}>
                      <Text style={styles.forgotLink}>
                        {locale === 'pt-BR' ? 'Esqueci minha senha' : 'Forgot password'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                <TextField
                  placeholder={mode === 'register' ? 'Mínimo 8 caracteres' : '••••••••••••'}
                  value={password}
                  onChangeText={setPassword}
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
              </View>

              <Button
                label={mode === 'login' ? t.auth.signInCta : t.auth.registerCta}
                onPress={handleSubmit}
                loading={submitting}
                icon={!submitting ? <ArrowRight size={17} color={colors.textOnDark} /> : undefined}
                style={styles.ctaButton}
              />
            </View>
          </Card>

          {/* Language & Meta Footer */}
          <View style={styles.footer}>
            <View style={styles.metaFooter}>
              <Pressable
                onPress={() => setLocale(locale === 'pt-BR' ? 'en' : 'pt-BR')}
                style={styles.localePill}
              >
                <View style={styles.localeDot} />
                <Text style={styles.localeText}>
                  {locale === 'pt-BR' ? 'PT-BR · EN' : 'EN · PT-BR'}
                </Text>
              </Pressable>
              <Text style={styles.footerNote}>{t.auth.footerNote}</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 28,
    justifyContent: 'center',
    gap: 20,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  brandBlock: {
    alignItems: 'center',
    gap: 4,
  },
  brandIconHalo: {
    padding: 4,
    borderRadius: 20,
    backgroundColor: colors.brandPrimarySoft,
    marginBottom: 8,
  },
  brandIconBox: {
    width: 56,
    height: 56,
    borderRadius: radius.xl,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brandPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  wordmark: {
    fontFamily: fonts.headlineBold,
    fontSize: 26,
    letterSpacing: -0.65,
    color: colors.textPrimary,
  },
  tagline: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.textMuted,
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: colors.darkPillBg,
  },
  segmentText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textMuted,
  },
  segmentTextActive: {
    fontFamily: fonts.bodySemiBold,
    color: colors.textOnDark,
  },
  authCard: {
    borderRadius: radius.xl,
    padding: 20,
    gap: 16,
  },
  cardHeader: {
    gap: 4,
  },
  cardTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 18,
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textMuted,
  },
  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorBannerText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.dangerDark,
  },
  formFields: {
    gap: 14,
  },
  passwordGroup: {
    gap: 6,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  passwordLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  forgotLink: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.brandPrimary,
  },
  ctaButton: {
    marginTop: 4,
    shadowColor: colors.brandPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 3,
  },
  footer: {
    marginTop: 4,
  },
  metaFooter: {
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.xs,
  },
  localePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  localeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brandPrimary,
  },
  localeText: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    color: colors.textSecondary,
  },
  footerNote: {
    fontFamily: fonts.bodyRegular,
    fontSize: 10,
    color: colors.textMuted,
  },
});
