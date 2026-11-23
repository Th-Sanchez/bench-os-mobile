import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Info,
  LogOut,
  Settings,
} from 'lucide-react-native';
import { tenantSettingsApi, usersApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthProvider';
import { TeamMemberModal } from '@/components/settings/TeamMemberModal';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { Role, UpdateTenantSettingsRequest, UserResponse } from '@/types/api';

const TEMPLATE_VARIABLES = [
  '{customerName}',
  '{appliance}',
  '{orderNumber}',
  '{totalPrice}',
  '{trackingUrl}',
] as const;

const DEFAULT_WHATSAPP_TEMPLATE =
  'Olá {customerName}! Orçamento do {appliance} (OS #{orderNumber}): {totalPrice}. Acompanhe: {trackingUrl}';

function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'US'
  );
}

function formatMoneyInput(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

function parseMoneyInput(raw: string): number {
  const cleaned = raw.trim().replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  if (!cleaned) return Number.NaN;
  return Number(cleaned);
}

export default function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, isOwner, signOut } = useAuth();
  const { locale, setLocale, t } = useI18n();

  const [laborCostDraft, setLaborCostDraft] = useState<string | null>(null);
  const [estimatedDaysDraft, setEstimatedDaysDraft] = useState<string | null>(null);
  const [abandonmentDaysDraft, setAbandonmentDaysDraft] = useState<string | null>(null);
  const [whatsappTemplateDraft, setWhatsappTemplateDraft] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [memberModalOpen, setMemberModalOpen] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.get(),
  });

  const teamQuery = useQuery({
    queryKey: ['team-users'],
    queryFn: () => usersApi.list(),
    enabled: isOwner,
  });

  const settingsData = settingsQuery.data;
  const laborCostInput =
    laborCostDraft ?? formatMoneyInput(Number(settingsData?.defaultLaborCost ?? 80));
  const estimatedDaysInput =
    estimatedDaysDraft ?? String(settingsData?.defaultEstimatedDays ?? 3);
  const abandonmentDaysInput =
    abandonmentDaysDraft ?? String(settingsData?.abandonmentDays ?? 180);
  const whatsappTemplate =
    whatsappTemplateDraft ?? (settingsData?.whatsappQuoteTemplate || DEFAULT_WHATSAPP_TEMPLATE);

  const updateSettingsMutation = useMutation({
    mutationFn: (payload: UpdateTenantSettingsRequest) => tenantSettingsApi.update(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      setLaborCostDraft(null);
      setEstimatedDaysDraft(null);
      setAbandonmentDaysDraft(null);
      setWhatsappTemplateDraft(null);
      setSaveFeedback({
        type: 'success',
        text:
          locale === 'pt-BR'
            ? 'Configurações da oficina atualizadas.'
            : 'Workshop settings saved.',
      });
    },
    onError: (err) => {
      setSaveFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : t.common.errorGeneric,
      });
    },
  });

  const toggleUserStatusMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      usersApi.updateStatus(id, active),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['team-users'] });
    },
    onError: (err) => {
      Alert.alert(
        locale === 'pt-BR' ? 'Erro' : 'Error',
        err instanceof Error ? err.message : t.common.errorGeneric
      );
    },
  });

  const handleSaveSettings = () => {
    setSaveFeedback(null);

    const labor = parseMoneyInput(laborCostInput);
    const estDays = Number.parseInt(estimatedDaysInput.replace(/\D/g, ''), 10);
    const abandonDays = Number.parseInt(abandonmentDaysInput.replace(/\D/g, ''), 10);

    if (!Number.isFinite(labor) || labor < 0) {
      setSaveFeedback({
        type: 'error',
        text:
          locale === 'pt-BR'
            ? 'Informe um valor válido para mão de obra padrão.'
            : 'Enter a valid default labor cost.',
      });
      return;
    }

    if (!Number.isFinite(estDays) || estDays < 1) {
      setSaveFeedback({
        type: 'error',
        text:
          locale === 'pt-BR'
            ? 'O prazo padrão deve ser de pelo menos 1 dia.'
            : 'Default estimated days must be at least 1.',
      });
      return;
    }

    if (!Number.isFinite(abandonDays) || abandonDays < 30) {
      setSaveFeedback({
        type: 'error',
        text:
          locale === 'pt-BR'
            ? 'O prazo de abandono deve ser de pelo menos 30 dias.'
            : 'Abandonment period must be at least 30 days.',
      });
      return;
    }

    updateSettingsMutation.mutate({
      defaultLaborCost: Number(labor.toFixed(2)),
      defaultEstimatedDays: estDays,
      abandonmentDays: abandonDays,
      whatsappQuoteTemplate: whatsappTemplate.trim(),
    });
  };

  const handleInsertVariable = (variable: string) => {
    if (!isOwner) return;
    const sep = whatsappTemplate.length > 0 && !whatsappTemplate.endsWith(' ') ? ' ' : '';
    setWhatsappTemplateDraft(`${whatsappTemplate}${sep}${variable}`);
  };

  const handleSignOut = () => {
    Alert.alert(
      locale === 'pt-BR' ? 'Sair da conta' : 'Sign out',
      locale === 'pt-BR'
        ? 'Deseja encerrar sua sessão neste dispositivo?'
        : 'Do you want to sign out on this device?',
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: locale === 'pt-BR' ? 'Sair' : 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            queryClient.clear();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const handleRefresh = () => {
    void settingsQuery.refetch();
    if (isOwner) {
      void teamQuery.refetch();
    }
  };

  const userRole: Role = session?.user.role ?? 'TECHNICIAN';
  const teamMembers = teamQuery.data ?? [];
  const isRefreshing = settingsQuery.isRefetching || (isOwner && teamQuery.isRefetching);

  const renderRoleBadge = (role: Role) => {
    const isOwnerRole = role === 'OWNER';
    const isAttendant = role === 'ATTENDANT';
    return (
      <View
        style={[
          styles.memberRoleBadge,
          isOwnerRole
            ? styles.memberRoleOwner
            : isAttendant
              ? styles.memberRoleAttendant
              : styles.memberRoleTech,
        ]}
      >
        <Text
          style={[
            styles.memberRoleText,
            isOwnerRole
              ? styles.memberRoleTextOwner
              : isAttendant
                ? styles.memberRoleTextAttendant
                : styles.memberRoleTextTech,
          ]}
        >
          {t.role[role]}
        </Text>
      </View>
    );
  };

  const renderAvatar = (member: UserResponse) => {
    const isOwnerRole = member.role === 'OWNER';
    const isAttendant = member.role === 'ATTENDANT';
    return (
      <View
        style={[
          styles.avatar,
          isOwnerRole
            ? styles.avatarOwner
            : isAttendant
              ? styles.avatarAttendant
              : styles.avatarTech,
        ]}
      >
        <Text
          style={[
            styles.avatarText,
            isOwnerRole
              ? styles.avatarTextOwner
              : isAttendant
                ? styles.avatarTextAttendant
                : styles.avatarTextTech,
          ]}
        >
          {getInitials(member.name)}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brandPrimary}
            colors={[colors.brandPrimary]}
          />
        }
      >
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.shopName} numberOfLines={1}>
              {(session?.tenant.name ?? 'BenchOS').toUpperCase()}
            </Text>
            <Text style={styles.title}>{locale === 'pt-BR' ? 'Ajustes' : 'Settings'}</Text>
          </View>
          <View style={styles.headerRolePill}>
            <Text style={styles.headerRoleText}>{t.role[userRole]}</Text>
          </View>
        </View>

        {/* Section 1: Parâmetros da Oficina */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardOverline}>
              {locale === 'pt-BR' ? 'PARÂMETROS DA OFICINA' : 'WORKSHOP PARAMETERS'}
            </Text>
            <Settings size={16} color={colors.textMuted} strokeWidth={2} />
          </View>

          {settingsQuery.isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.brandPrimary} />
            </View>
          ) : (
            <View style={styles.formGap}>
              <View style={styles.twoColRow}>
                <View style={styles.colField}>
                  <Text style={styles.fieldLabel}>
                    {locale === 'pt-BR' ? 'Mão de obra padrão' : 'Default labor'}
                  </Text>
                  <View style={[styles.monoInputBox, !isOwner && styles.inputReadonly]}>
                    <Text style={styles.inputPrefix}>R$</Text>
                    <TextInput
                      value={laborCostInput}
                      onChangeText={setLaborCostDraft}
                      editable={isOwner}
                      keyboardType="decimal-pad"
                      style={styles.monoInput}
                    />
                  </View>
                </View>

                <View style={styles.colField}>
                  <Text style={styles.fieldLabel}>
                    {locale === 'pt-BR' ? 'Prazo padrão (dias)' : 'Default ETA (days)'}
                  </Text>
                  <View style={[styles.monoInputBox, !isOwner && styles.inputReadonly]}>
                    <TextInput
                      value={estimatedDaysInput}
                      onChangeText={setEstimatedDaysDraft}
                      editable={isOwner}
                      keyboardType="number-pad"
                      style={styles.monoInput}
                    />
                    <Text style={styles.inputSuffix}>
                      {locale === 'pt-BR' ? 'dias' : 'days'}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  {locale === 'pt-BR'
                    ? 'Prazo de abandono (descarte)'
                    : 'Abandonment period (discard)'}
                </Text>
                <View style={[styles.monoInputBox, !isOwner && styles.inputReadonly]}>
                  <TextInput
                    value={abandonmentDaysInput}
                    onChangeText={setAbandonmentDaysDraft}
                    editable={isOwner}
                    keyboardType="number-pad"
                    style={styles.monoInput}
                  />
                  <Text style={styles.inputSuffix}>
                    {locale === 'pt-BR' ? 'dias' : 'days'}
                  </Text>
                </View>
                <View style={styles.infoHintRow}>
                  <Info size={13} color={colors.textMuted} />
                  <Text style={styles.infoHintText}>
                    {locale === 'pt-BR'
                      ? 'Aparelhos prontos/recusados elegíveis para descarte após este prazo'
                      : 'Ready or rejected appliances eligible for discard after this period'}
                  </Text>
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  {locale === 'pt-BR'
                    ? 'Template WhatsApp (Orçamento)'
                    : 'WhatsApp Quote Template'}
                </Text>
                <TextInput
                  value={whatsappTemplate}
                  onChangeText={setWhatsappTemplateDraft}
                  editable={isOwner}
                  multiline
                  textAlignVertical="top"
                  style={[styles.textarea, !isOwner && styles.inputReadonly]}
                />
                <View style={styles.varChipsWrap}>
                  {TEMPLATE_VARIABLES.map((variable) => (
                    <Pressable
                      key={variable}
                      disabled={!isOwner}
                      onPress={() => handleInsertVariable(variable)}
                      style={({ pressed }) => [
                        styles.varChip,
                        pressed && isOwner && styles.varChipPressed,
                      ]}
                    >
                      <Text style={styles.varChipText}>{variable}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {saveFeedback ? (
                <View
                  style={[
                    styles.feedbackBox,
                    saveFeedback.type === 'success'
                      ? styles.feedbackSuccess
                      : styles.feedbackError,
                  ]}
                >
                  <Text
                    style={[
                      styles.feedbackText,
                      saveFeedback.type === 'success'
                        ? styles.feedbackTextSuccess
                        : styles.feedbackTextError,
                    ]}
                  >
                    {saveFeedback.text}
                  </Text>
                </View>
              ) : null}

              {isOwner ? (
                <Button
                  label={locale === 'pt-BR' ? 'Salvar configurações' : 'Save settings'}
                  icon={<Check size={16} color={colors.textOnDark} strokeWidth={2.4} />}
                  loading={updateSettingsMutation.isPending}
                  onPress={handleSaveSettings}
                />
              ) : (
                <Text style={styles.readonlyNotice}>
                  {locale === 'pt-BR'
                    ? 'Apenas o proprietário (OWNER) pode alterar os parâmetros da oficina.'
                    : 'Only the workshop OWNER can modify these settings.'}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Section 2: Equipe da Oficina (OWNER) or Current Operator Card */}
        {isOwner ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardOverline}>
                {locale === 'pt-BR' ? 'EQUIPE DA OFICINA' : 'WORKSHOP TEAM'}
              </Text>
              <Pressable onPress={() => setMemberModalOpen(true)} hitSlop={8}>
                <Text style={styles.addMemberLink}>
                  {locale === 'pt-BR' ? '+ Novo membro' : '+ Add member'}
                </Text>
              </Pressable>
            </View>

            {teamQuery.isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.brandPrimary} />
              </View>
            ) : (
              <View style={styles.membersList}>
                {teamMembers.map((member, index) => {
                  const isSelf = member.id === session?.user.id;
                  const canToggle = !isSelf && member.role !== 'OWNER';

                  return (
                    <View
                      key={member.id}
                      style={[styles.memberRow, index > 0 && styles.memberRowDivider]}
                    >
                      <View style={styles.memberLeft}>
                        {renderAvatar(member)}
                        <View style={styles.memberInfo}>
                          <View style={styles.memberNameRow}>
                            <Text style={styles.memberName} numberOfLines={1}>
                              {member.name}
                            </Text>
                            {renderRoleBadge(member.role)}
                          </View>
                          <Text style={styles.memberEmail} numberOfLines={1}>
                            {member.email}
                          </Text>
                        </View>
                      </View>

                      {canToggle ? (
                        <Switch
                          value={member.active}
                          disabled={toggleUserStatusMutation.isPending}
                          onValueChange={(nextValue) =>
                            toggleUserStatusMutation.mutate({
                              id: member.id,
                              active: nextValue,
                            })
                          }
                          trackColor={{
                            false: colors.borderStrong,
                            true: colors.brandPrimary,
                          }}
                          thumbColor={colors.bgSurface}
                        />
                      ) : (
                        <View style={styles.activePill}>
                          <View style={styles.activeDot} />
                          <Text style={styles.activePillText}>
                            {locale === 'pt-BR' ? 'Ativo' : 'Active'}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : session?.user ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardOverline}>
                {locale === 'pt-BR' ? 'OPERADOR CONECTADO' : 'SIGNED-IN OPERATOR'}
              </Text>
            </View>
            <View style={styles.memberRow}>
              <View style={styles.memberLeft}>
                {renderAvatar(session.user)}
                <View style={styles.memberInfo}>
                  <View style={styles.memberNameRow}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {session.user.name}
                    </Text>
                    {renderRoleBadge(session.user.role)}
                  </View>
                  <Text style={styles.memberEmail} numberOfLines={1}>
                    {session.user.email}
                  </Text>
                </View>
              </View>
              <View style={styles.activePill}>
                <View style={styles.activeDot} />
                <Text style={styles.activePillText}>
                  {locale === 'pt-BR' ? 'Ativo' : 'Active'}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Section 3: App Preferences & Logout */}
        <View style={styles.card}>
          <View style={styles.langRow}>
            <View style={styles.langCopy}>
              <Text style={styles.langTitle}>
                {locale === 'pt-BR' ? 'Idioma do aplicativo' : 'App language'}
              </Text>
              <Text style={styles.langSubtitle}>
                {locale === 'pt-BR'
                  ? 'Interface e formatação de valores'
                  : 'Interface and value formatting'}
              </Text>
            </View>

            <View style={styles.segmentedControl}>
              <Pressable
                onPress={() => setLocale('pt-BR')}
                style={[
                  styles.segmentBtn,
                  locale === 'pt-BR' && styles.segmentBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    locale === 'pt-BR' && styles.segmentTextActive,
                  ]}
                >
                  PT-BR
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setLocale('en')}
                style={[
                  styles.segmentBtn,
                  locale === 'en' && styles.segmentBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    locale === 'en' && styles.segmentTextActive,
                  ]}
                >
                  EN
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.logoutDivider} />

          <Button
            label={locale === 'pt-BR' ? 'Sair da conta' : 'Sign out'}
            variant="dangerOutline"
            icon={<LogOut size={16} color={colors.danger} strokeWidth={2.2} />}
            onPress={handleSignOut}
          />
        </View>
      </ScrollView>

      {isOwner ? (
        <TeamMemberModal
          visible={memberModalOpen}
          onClose={() => setMemberModalOpen(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgCanvas,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 40,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  shopName: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.textMuted,
  },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: 24,
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  headerRolePill: {
    backgroundColor: colors.darkPillBg,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  headerRoleText: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    color: colors.textOnDark,
    letterSpacing: 0.3,
  },
  card: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: 16,
    gap: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.bgSubtle,
    paddingBottom: 10,
  },
  cardOverline: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.textMuted,
  },
  addMemberLink: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.brandPrimary,
  },
  loadingRow: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  formGap: {
    gap: 14,
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 12,
  },
  colField: {
    flex: 1,
    gap: 5,
  },
  fieldGroup: {
    gap: 5,
  },
  fieldLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.neutralDark,
  },
  monoInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  inputReadonly: {
    opacity: 0.78,
  },
  inputPrefix: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    color: colors.textMuted,
  },
  inputSuffix: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.textMuted,
  },
  monoInput: {
    flex: 1,
    fontFamily: fonts.monoBold,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 8,
  },
  infoHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  infoHintText: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
  },
  textarea: {
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: 12,
    minHeight: 88,
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 19,
  },
  varChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  varChip: {
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  varChipPressed: {
    opacity: 0.75,
  },
  varChipText: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: colors.brandPrimary,
  },
  feedbackBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  feedbackSuccess: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successBorder,
  },
  feedbackError: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  feedbackText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
  },
  feedbackTextSuccess: {
    color: colors.successDark,
  },
  feedbackTextError: {
    color: colors.dangerDark,
  },
  readonlyNotice: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  membersList: {
    gap: 0,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
  },
  memberRowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.bgSubtle,
  },
  memberLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOwner: {
    backgroundColor: colors.darkPillBg,
  },
  avatarAttendant: {
    backgroundColor: '#DBEAFE',
  },
  avatarTech: {
    backgroundColor: colors.bgSubtle,
  },
  avatarText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  avatarTextOwner: {
    color: colors.textOnDark,
  },
  avatarTextAttendant: {
    color: colors.brandPrimary,
  },
  avatarTextTech: {
    color: colors.neutralDark,
  },
  memberInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  memberName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  memberEmail: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textMuted,
  },
  memberRoleBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  memberRoleOwner: {
    backgroundColor: colors.darkPillBg,
  },
  memberRoleAttendant: {
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
  },
  memberRoleTech: {
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  memberRoleText: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
  },
  memberRoleTextOwner: {
    color: colors.textOnDark,
  },
  memberRoleTextAttendant: {
    color: colors.brandPrimary,
  },
  memberRoleTextTech: {
    color: colors.neutralDark,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  activePillText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.successDark,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  langCopy: {
    flex: 1,
    gap: 2,
  },
  langTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  langSubtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: 11,
    color: colors.textMuted,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: 3,
  },
  segmentBtn: {
    borderRadius: 6,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  segmentBtnActive: {
    backgroundColor: colors.bgSurface,
  },
  segmentText: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.textMuted,
  },
  segmentTextActive: {
    fontFamily: fonts.monoBold,
    color: colors.textPrimary,
  },
  logoutDivider: {
    height: 1,
    backgroundColor: colors.bgSubtle,
  },
});
