import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
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
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import {
  BookOpen,
  Check,
  ClipboardCheck,
  ImagePlus,
  Info,
  KeyRound,
  Lightbulb,
  LogOut,
  Package,
  PenTool,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Settings,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react-native';
import { partsCatalogApi, tenantSettingsApi, usersApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthProvider';
import { PartsCatalogModal } from '@/components/settings/PartsCatalogModal';
import { ResetMemberPasswordModal } from '@/components/settings/ResetMemberPasswordModal';
import { TeamMemberModal } from '@/components/settings/TeamMemberModal';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n/I18nProvider';
import { usePushNotifications } from '@/notifications/PushNotificationsContext';
import { getAppVersionLabel, isSentryConfigured } from '@/observability/sentry';
import { useNetworkStatus } from '@/offline/NetworkStatusContext';
import {
  clearPersistedQueryCache,
  getPersistedCacheStats,
} from '@/offline/queryPersistence';
import {
  usePrintPreferences,
  type PrintLabelMode,
} from '@/settings/PrintPreferencesContext';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type {
  Role,
  UpdateTenantSettingsRequest,
  UserResponse,
  WhatsappMessageStage,
} from '@/types/api';
import { shareSampleLabelPdf } from '@/utils/labelPrintPdf';
import {
  mergeApplianceTypes,
  resolveChecklistForCategory,
} from '@/constants/appliances';
import {
  formatCurrencyInput,
  maskCurrencyBRL,
  maskInteger,
  parseCurrencyBRL,
} from '@/utils/masks';

const TEMPLATE_PLACEHOLDERS = [
  { api: '{customerName}', ptBr: '{nomeCliente}' },
  { api: '{appliances}', ptBr: '{aparelhos}' },
  { api: '{orderNumber}', ptBr: '{numeroOS}' },
  { api: '{totalPrice}', ptBr: '{valorTotal}' },
  { api: '{trackingUrl}', ptBr: '{linkAcompanhamento}' },
] as const;

const LEGACY_PLACEHOLDERS = [{ api: '{appliance}', ptBr: '{aparelho}' }] as const;

const DEFAULT_TEMPLATES_API: Record<WhatsappMessageStage, string> = {
  INTAKE:
    'Olá {customerName}! Registramos sua OS #{orderNumber}:\n{appliances}\nAcompanhe o andamento em tempo real: {trackingUrl}',
  QUOTE:
    'Olá {customerName}! Segue o orçamento da OS #{orderNumber}:\n{appliances}\nTotal: {totalPrice}\nAprove ou acompanhe por aqui: {trackingUrl}',
  READY:
    'Olá {customerName}! Seus aparelhos da OS #{orderNumber} estão prontos para retirada:\n{appliances}\nTotal: {totalPrice}\nDetalhes: {trackingUrl}',
};

function toDisplayTemplate(apiTemplate: string, locale: 'pt-BR' | 'en'): string {
  let result = apiTemplate;
  const allPairs = [...TEMPLATE_PLACEHOLDERS, ...LEGACY_PLACEHOLDERS];
  if (locale === 'pt-BR') {
    for (const pair of allPairs) {
      result = result.split(pair.api).join(pair.ptBr);
    }
  } else {
    for (const pair of allPairs) {
      result = result.split(pair.ptBr).join(pair.api);
    }
  }
  return result;
}

function toApiTemplate(displayTemplate: string): string {
  let result = displayTemplate;
  for (const pair of [...TEMPLATE_PLACEHOLDERS, ...LEGACY_PLACEHOLDERS]) {
    result = result.split(pair.ptBr).join(pair.api);
  }
  return result;
}

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

export default function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, isOwner, signOut } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const {
    status: pushStatus,
    isBusy: isPushBusy,
    enableNotifications,
  } = usePushNotifications();
  const { isOffline, lastSyncedAt } = useNetworkStatus();
  const [clearingCache, setClearingCache] = useState(false);

  const cacheStatsQuery = useQuery({
    queryKey: ['offline-cache-stats', lastSyncedAt ?? 0],
    queryFn: () => getPersistedCacheStats(),
    staleTime: 5_000,
  });
  const {
    mode: printMode,
    scannerEnabled,
    isPrintEnabled,
    setMode: setPrintMode,
    setScannerEnabled,
  } = usePrintPreferences();
  const [testingSampleLabel, setTestingSampleLabel] = useState(false);

  const [laborCostDraft, setLaborCostDraft] = useState<string | null>(null);
  const [estimatedDaysDraft, setEstimatedDaysDraft] = useState<string | null>(null);
  const [abandonmentDaysDraft, setAbandonmentDaysDraft] = useState<string | null>(null);
  const [googleReviewUrlDraft, setGoogleReviewUrlDraft] = useState<string | null>(null);
  const [deliverySignatureDraft, setDeliverySignatureDraft] = useState<boolean | null>(null);
  const [technicianAssignmentDraft, setTechnicianAssignmentDraft] = useState<boolean | null>(null);
  const [pixKeyDraft, setPixKeyDraft] = useState<string | null>(null);
  const [pixReceiverNameDraft, setPixReceiverNameDraft] = useState<string | null>(null);
  const [pixReceiverCityDraft, setPixReceiverCityDraft] = useState<string | null>(null);
  const [logoDraft, setLogoDraft] = useState<string | null | undefined>(undefined);
  const [shopAddressDraft, setShopAddressDraft] = useState<string | null>(null);
  const [businessHoursDraft, setBusinessHoursDraft] = useState<string | null>(null);
  const [warrantyTermsDraft, setWarrantyTermsDraft] = useState<string | null>(null);
  const [brandingFeedback, setBrandingFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [activeTemplateStage, setActiveTemplateStage] = useState<WhatsappMessageStage>('INTAKE');
  const [intakeDraft, setIntakeDraft] = useState<string | null>(null);
  const [quoteDraft, setQuoteDraft] = useState<string | null>(null);
  const [readyDraft, setReadyDraft] = useState<string | null>(null);

  const [newApplianceType, setNewApplianceType] = useState('');
  const [selectedChecklistCategory, setSelectedChecklistCategory] = useState('Micro-ondas');
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [selectedCareCategory, setSelectedCareCategory] = useState('Micro-ondas');
  const [newCareTip, setNewCareTip] = useState('');
  const [saveFeedback, setSaveFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [resetPasswordMember, setResetPasswordMember] = useState<UserResponse | null>(null);
  const [partsCatalogModalOpen, setPartsCatalogModalOpen] = useState(false);

  const canManagePartsCatalog =
    session?.user.role === 'OWNER' || session?.user.role === 'TECHNICIAN';

  const settingsQuery = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.get(),
  });

  const partsCatalogQuery = useQuery({
    queryKey: ['parts-catalog'],
    queryFn: () => partsCatalogApi.list(),
    enabled: canManagePartsCatalog,
  });

  const teamQuery = useQuery({
    queryKey: ['team-users'],
    queryFn: () => usersApi.list(),
    enabled: isOwner,
  });

  const settingsData = settingsQuery.data;
  const laborCostInput =
    laborCostDraft ?? formatCurrencyInput(Number(settingsData?.defaultLaborCost ?? 0));
  const estimatedDaysInput =
    estimatedDaysDraft ?? String(settingsData?.defaultEstimatedDays ?? 3);
  const abandonmentDaysInput =
    abandonmentDaysDraft ?? String(settingsData?.abandonmentDays ?? 180);
  const googleReviewUrlInput =
    googleReviewUrlDraft ?? (settingsData?.googleReviewUrl ?? '');
  const deliverySignatureEnabled =
    deliverySignatureDraft ?? Boolean(settingsData?.deliverySignatureEnabled);
  const technicianAssignmentEnabled =
    technicianAssignmentDraft ?? Boolean(settingsData?.technicianAssignmentEnabled);
  const pixKeyInput = pixKeyDraft ?? (settingsData?.pixKey ?? '');
  const pixReceiverNameInput = pixReceiverNameDraft ?? (settingsData?.pixReceiverName ?? '');
  const pixReceiverCityInput = pixReceiverCityDraft ?? (settingsData?.pixReceiverCity ?? '');
  const currentLogoUrl = logoDraft !== undefined ? logoDraft : (settingsData?.shopLogoDataUrl ?? null);
  const shopAddressInput = shopAddressDraft ?? (settingsData?.shopAddress ?? '');
  const businessHoursInput = businessHoursDraft ?? (settingsData?.businessHours ?? '');
  const warrantyTermsInput = warrantyTermsDraft ?? (settingsData?.warrantyTerms ?? '');

  const intakeTemplate =
    intakeDraft ??
    toDisplayTemplate(
      settingsData?.whatsappIntakeTemplate || DEFAULT_TEMPLATES_API.INTAKE,
      locale
    );
  const quoteTemplate =
    quoteDraft ??
    toDisplayTemplate(
      settingsData?.whatsappQuoteTemplate || DEFAULT_TEMPLATES_API.QUOTE,
      locale
    );
  const readyTemplate =
    readyDraft ??
    toDisplayTemplate(
      settingsData?.whatsappReadyTemplate || DEFAULT_TEMPLATES_API.READY,
      locale
    );

  const currentTemplateValue =
    activeTemplateStage === 'INTAKE'
      ? intakeTemplate
      : activeTemplateStage === 'QUOTE'
        ? quoteTemplate
        : readyTemplate;

  const setCurrentTemplateDraft = (next: string) => {
    if (activeTemplateStage === 'INTAKE') setIntakeDraft(next);
    else if (activeTemplateStage === 'QUOTE') setQuoteDraft(next);
    else setReadyDraft(next);
  };

  const updateSettingsMutation = useMutation({
    mutationFn: (payload: UpdateTenantSettingsRequest) => tenantSettingsApi.update(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      setLaborCostDraft(null);
      setEstimatedDaysDraft(null);
      setAbandonmentDaysDraft(null);
      setGoogleReviewUrlDraft(null);
      setDeliverySignatureDraft(null);
      setTechnicianAssignmentDraft(null);
      setPixKeyDraft(null);
      setPixReceiverNameDraft(null);
      setPixReceiverCityDraft(null);
      setIntakeDraft(null);
      setQuoteDraft(null);
      setReadyDraft(null);
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

  const addApplianceTypeMutation = useMutation({
    mutationFn: (name: string) => tenantSettingsApi.addApplianceType(name),
    onSuccess: (updated) => {
      queryClient.setQueryData(['tenant-settings'], updated);
      setNewApplianceType('');
    },
    onError: (err) => {
      Alert.alert(
        locale === 'pt-BR' ? 'Erro' : 'Error',
        err instanceof Error ? err.message : t.common.errorGeneric
      );
    },
  });

  const removeApplianceTypeMutation = useMutation({
    mutationFn: (name: string) => tenantSettingsApi.removeApplianceType(name),
    onSuccess: (updated) => {
      queryClient.setQueryData(['tenant-settings'], updated);
    },
  });

  const checklistTemplates = useMemo(
    () => settingsData?.intakeChecklistTemplates ?? {},
    [settingsData?.intakeChecklistTemplates]
  );

  const checklistCategories = useMemo(
    () =>
      mergeApplianceTypes([
        ...(settingsData?.customApplianceTypes ?? []),
        ...Object.keys(checklistTemplates),
      ]),
    [settingsData?.customApplianceTypes, checklistTemplates]
  );

  const activeChecklistItems = useMemo(
    () => resolveChecklistForCategory(checklistTemplates, selectedChecklistCategory),
    [checklistTemplates, selectedChecklistCategory]
  );

  const updateChecklistsMutation = useMutation({
    mutationFn: (templates: Record<string, string[]>) =>
      tenantSettingsApi.updateIntakeChecklists(templates),
    onSuccess: (updated) => {
      queryClient.setQueryData(['tenant-settings'], updated);
      setNewChecklistItem('');
    },
    onError: (err) => {
      Alert.alert(
        locale === 'pt-BR' ? 'Erro' : 'Error',
        err instanceof Error ? err.message : t.common.errorGeneric
      );
    },
  });

  const resetChecklistsMutation = useMutation({
    mutationFn: () => tenantSettingsApi.resetIntakeChecklists(),
    onSuccess: (updated) => {
      queryClient.setQueryData(['tenant-settings'], updated);
    },
    onError: (err) => {
      Alert.alert(
        locale === 'pt-BR' ? 'Erro' : 'Error',
        err instanceof Error ? err.message : t.common.errorGeneric
      );
    },
  });

  const updateBrandingMutation = useMutation({
    mutationFn: () =>
      tenantSettingsApi.updateBranding({
        shopLogoDataUrl: logoDraft === undefined ? undefined : (logoDraft ?? undefined),
        clearLogo: logoDraft === null ? true : undefined,
        shopAddress: shopAddressInput.trim(),
        businessHours: businessHoursInput.trim(),
        warrantyTerms: warrantyTermsInput.trim(),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['tenant-settings'], updated);
      setLogoDraft(undefined);
      setShopAddressDraft(null);
      setBusinessHoursDraft(null);
      setWarrantyTermsDraft(null);
      setBrandingFeedback({
        type: 'success',
        text:
          locale === 'pt-BR'
            ? 'Identidade visual e termos atualizados.'
            : 'Shop branding and terms saved.',
      });
    },
    onError: (err) => {
      setBrandingFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : t.common.errorGeneric,
      });
    },
  });

  const handlePickLogo = async () => {
    setBrandingFeedback(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        locale === 'pt-BR' ? 'Permissão necessária' : 'Permission required',
        locale === 'pt-BR'
          ? 'Permita o acesso à galeria para escolher a logo da oficina.'
          : 'Allow photo library access to pick your workshop logo.'
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 256 } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (manipulated.base64) {
        setLogoDraft(`data:image/jpeg;base64,${manipulated.base64}`);
      }
    } catch (err) {
      Alert.alert(
        locale === 'pt-BR' ? 'Erro ao processar imagem' : 'Could not process image',
        err instanceof Error ? err.message : t.common.errorGeneric
      );
    }
  };

  const mutateCategoryChecklist = (nextItems: string[]) => {
    const nextMap: Record<string, string[]> = {};
    const targetLower = selectedChecklistCategory.trim().toLowerCase();
    let replaced = false;
    for (const [key, items] of Object.entries(checklistTemplates)) {
      if (key.trim().toLowerCase() === targetLower) {
        nextMap[key] = nextItems;
        replaced = true;
      } else {
        nextMap[key] = items;
      }
    }
    if (!replaced) {
      nextMap[selectedChecklistCategory] = nextItems;
    }
    updateChecklistsMutation.mutate(nextMap);
  };

  const handleAddChecklistItem = () => {
    const trimmed = newChecklistItem.trim();
    if (!trimmed) return;
    if (activeChecklistItems.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
      setNewChecklistItem('');
      return;
    }
    mutateCategoryChecklist([...activeChecklistItems, trimmed]);
  };

  const careTipsTemplates = useMemo(
    () => settingsData?.careTipsTemplates ?? {},
    [settingsData?.careTipsTemplates]
  );

  const careTipCategories = useMemo(
    () =>
      mergeApplianceTypes([
        ...(settingsData?.customApplianceTypes ?? []),
        ...Object.keys(careTipsTemplates),
      ]),
    [settingsData?.customApplianceTypes, careTipsTemplates]
  );

  const activeCareTips = useMemo(
    () => resolveChecklistForCategory(careTipsTemplates, selectedCareCategory),
    [careTipsTemplates, selectedCareCategory]
  );

  const updateCareTipsMutation = useMutation({
    mutationFn: (templates: Record<string, string[]>) =>
      tenantSettingsApi.updateCareTips(templates),
    onSuccess: (updated) => {
      queryClient.setQueryData(['tenant-settings'], updated);
      setNewCareTip('');
    },
    onError: (err) => {
      Alert.alert(
        locale === 'pt-BR' ? 'Erro' : 'Error',
        err instanceof Error ? err.message : t.common.errorGeneric
      );
    },
  });

  const resetCareTipsMutation = useMutation({
    mutationFn: () => tenantSettingsApi.resetCareTips(),
    onSuccess: (updated) => {
      queryClient.setQueryData(['tenant-settings'], updated);
    },
    onError: (err) => {
      Alert.alert(
        locale === 'pt-BR' ? 'Erro' : 'Error',
        err instanceof Error ? err.message : t.common.errorGeneric
      );
    },
  });

  const mutateCategoryCareTips = (nextTips: string[]) => {
    const nextMap: Record<string, string[]> = {};
    const targetLower = selectedCareCategory.trim().toLowerCase();
    let replaced = false;
    for (const [key, tips] of Object.entries(careTipsTemplates)) {
      if (key.trim().toLowerCase() === targetLower) {
        nextMap[key] = nextTips;
        replaced = true;
      } else {
        nextMap[key] = tips;
      }
    }
    if (!replaced) {
      nextMap[selectedCareCategory] = nextTips;
    }
    updateCareTipsMutation.mutate(nextMap);
  };

  const handleAddCareTip = () => {
    const trimmed = newCareTip.trim();
    if (!trimmed) return;
    if (activeCareTips.some((tip) => tip.toLowerCase() === trimmed.toLowerCase())) {
      setNewCareTip('');
      return;
    }
    mutateCategoryCareTips([...activeCareTips, trimmed]);
  };

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

    const labor = parseCurrencyBRL(laborCostInput);
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

    const trimmedGoogleUrl = googleReviewUrlInput.trim();
    if (trimmedGoogleUrl && !/^https?:\/\//i.test(trimmedGoogleUrl)) {
      setSaveFeedback({
        type: 'error',
        text:
          locale === 'pt-BR'
            ? 'O link do Google deve começar com https:// ou http://'
            : 'Google review link must start with https:// or http://',
      });
      return;
    }

    const trimmedPixKey = pixKeyInput.trim();
    if (trimmedPixKey && /\s/.test(trimmedPixKey)) {
      setSaveFeedback({
        type: 'error',
        text:
          locale === 'pt-BR'
            ? 'A chave Pix não pode conter espaços.'
            : 'Pix key must not contain spaces.',
      });
      return;
    }

    updateSettingsMutation.mutate({
      defaultLaborCost: Number(labor.toFixed(2)),
      defaultEstimatedDays: estDays,
      abandonmentDays: abandonDays,
      whatsappIntakeTemplate: toApiTemplate(intakeTemplate.trim()),
      whatsappQuoteTemplate: toApiTemplate(quoteTemplate.trim()),
      whatsappReadyTemplate: toApiTemplate(readyTemplate.trim()),
      googleReviewUrl: trimmedGoogleUrl,
      deliverySignatureEnabled,
      technicianAssignmentEnabled,
      pixKey: trimmedPixKey,
      pixReceiverName: pixReceiverNameInput.trim(),
      pixReceiverCity: pixReceiverCityInput.trim(),
    });
  };

  const handleInsertVariable = (variable: string) => {
    if (!isOwner) return;
    const sep =
      currentTemplateValue.length > 0 && !currentTemplateValue.endsWith(' ') ? ' ' : '';
    setCurrentTemplateDraft(`${currentTemplateValue}${sep}${variable}`);
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
  const customTypes = settingsData?.customApplianceTypes ?? [];
  const isRefreshing = settingsQuery.isRefetching || (isOwner && teamQuery.isRefetching);

  const stageTabs: { key: WhatsappMessageStage; label: string }[] = [
    { key: 'INTAKE', label: locale === 'pt-BR' ? 'Entrada' : 'Intake' },
    { key: 'QUOTE', label: locale === 'pt-BR' ? 'Orçamento' : 'Quote' },
    { key: 'READY', label: locale === 'pt-BR' ? 'Pronto' : 'Ready' },
  ];

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
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
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
                      onChangeText={(val) => setLaborCostDraft(maskCurrencyBRL(val))}
                      placeholder="0,00"
                      placeholderTextColor={colors.textMuted}
                      editable={isOwner}
                      keyboardType="number-pad"
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
                      onChangeText={(val) => setEstimatedDaysDraft(maskInteger(val, 3))}
                      editable={isOwner}
                      keyboardType="number-pad"
                      maxLength={3}
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
                    onChangeText={(val) => setAbandonmentDaysDraft(maskInteger(val, 4))}
                    editable={isOwner}
                    keyboardType="number-pad"
                    maxLength={4}
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

              {/* Google Business Review Link */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  {locale === 'pt-BR'
                    ? 'Link de avaliação no Google (opcional)'
                    : 'Google Review Link (optional)'}
                </Text>
                <View style={[styles.monoInputBox, !isOwner && styles.inputReadonly]}>
                  <TextInput
                    value={googleReviewUrlInput}
                    onChangeText={setGoogleReviewUrlDraft}
                    placeholder="https://g.page/r/.../review"
                    placeholderTextColor={colors.textMuted}
                    editable={isOwner}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    maxLength={500}
                    style={[styles.monoInput, { fontFamily: fonts.bodyRegular, fontSize: 13 }]}
                  />
                </View>
                <View style={styles.infoHintRow}>
                  <Info size={13} color={colors.textMuted} />
                  <Text style={styles.infoHintText}>
                    {locale === 'pt-BR'
                      ? 'Clientes que avaliarem com 5★ no link /track verão um botão direto para avaliar sua oficina no Google.'
                      : 'Customers who rate 5★ on /track see a direct button to review your shop on Google.'}
                  </Text>
                </View>
              </View>

              {/* Pix Static QR Code Settings */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  {locale === 'pt-BR'
                    ? 'Chave Pix da oficina (opcional)'
                    : 'Workshop Pix Key (optional)'}
                </Text>
                <View style={[styles.monoInputBox, !isOwner && styles.inputReadonly]}>
                  <TextInput
                    value={pixKeyInput}
                    onChangeText={setPixKeyDraft}
                    placeholder="CNPJ/CPF, e-mail, aleatória ou +55..."
                    placeholderTextColor={colors.textMuted}
                    editable={isOwner}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={77}
                    style={[styles.monoInput, { fontSize: 13 }]}
                  />
                </View>
                <View style={styles.twoColRow}>
                  <View style={styles.colField}>
                    <Text style={styles.fieldLabel}>
                      {locale === 'pt-BR' ? 'Titular Pix (opcional)' : 'Pix Receiver'}
                    </Text>
                    <View style={[styles.monoInputBox, !isOwner && styles.inputReadonly]}>
                      <TextInput
                        value={pixReceiverNameInput}
                        onChangeText={setPixReceiverNameDraft}
                        placeholder={session?.tenant.name ?? 'Oficina'}
                        placeholderTextColor={colors.textMuted}
                        editable={isOwner}
                        maxLength={60}
                        style={[styles.monoInput, { fontFamily: fonts.bodyRegular, fontSize: 13 }]}
                      />
                    </View>
                  </View>
                  <View style={styles.colField}>
                    <Text style={styles.fieldLabel}>
                      {locale === 'pt-BR' ? 'Cidade Pix (opcional)' : 'Pix City'}
                    </Text>
                    <View style={[styles.monoInputBox, !isOwner && styles.inputReadonly]}>
                      <TextInput
                        value={pixReceiverCityInput}
                        onChangeText={setPixReceiverCityDraft}
                        placeholder="Sao Paulo"
                        placeholderTextColor={colors.textMuted}
                        editable={isOwner}
                        maxLength={60}
                        style={[styles.monoInput, { fontFamily: fonts.bodyRegular, fontSize: 13 }]}
                      />
                    </View>
                  </View>
                </View>
                <View style={styles.infoHintRow}>
                  <Info size={13} color={colors.textMuted} />
                  <Text style={styles.infoHintText}>
                    {locale === 'pt-BR'
                      ? 'Gera QR Code e Copia e Cola com valor exato no /track e na tela de entrega. Deixe em branco para desativar.'
                      : 'Generates exact-amount Pix QR & Copy-Paste on /track and delivery screen. Leave blank to disable.'}
                  </Text>
                </View>
              </View>

              {/* Digital Pickup Signature Toggle */}
              <View style={styles.logoutDivider} />
              <View style={styles.langRow}>
                <View style={styles.langCopy}>
                  <View style={styles.printHeaderTitleRow}>
                    <PenTool size={14} color={colors.brandPrimary} strokeWidth={2.1} />
                    <Text style={styles.langTitle}>
                      {locale === 'pt-BR'
                        ? 'Assinatura digital na retirada'
                        : 'Digital pickup signature'}
                    </Text>
                  </View>
                  <Text style={styles.langSubtitle}>
                    {locale === 'pt-BR'
                      ? 'Exibe o campo de assinatura na tela de entrega (app e web) para constar no comprovante e garantia'
                      : 'Shows the signature pad on delivery screens (mobile & web) and embeds it in the warranty receipt'}
                  </Text>
                </View>
                <Switch
                  value={deliverySignatureEnabled}
                  disabled={!isOwner}
                  onValueChange={(nextValue) => setDeliverySignatureDraft(nextValue)}
                  trackColor={{
                    false: colors.borderStrong,
                    true: colors.brandPrimary,
                  }}
                  thumbColor={colors.bgSurface}
                />
              </View>
              <View style={styles.logoutDivider} />

              {/* Optional Technician Assignment & Commissions Toggle */}
              <View style={styles.langRow}>
                <View style={styles.langCopy}>
                  <Text style={styles.langTitle}>
                    {locale === 'pt-BR'
                      ? 'Técnico responsável e comissões (opcional)'
                      : 'Assigned technician & commissions (optional)'}
                  </Text>
                  <Text style={styles.langSubtitle}>
                    {locale === 'pt-BR'
                      ? 'Ative em oficinas com equipe para atribuir técnico por aparelho e fechar comissões no Financeiro Web.'
                      : 'Enable for multi-tech shops to assign items and close monthly commissions in Web Finance.'}
                  </Text>
                </View>
                <Switch
                  value={technicianAssignmentEnabled}
                  disabled={!isOwner}
                  onValueChange={(nextValue) => setTechnicianAssignmentDraft(nextValue)}
                  trackColor={{
                    false: colors.borderStrong,
                    true: colors.brandPrimary,
                  }}
                  thumbColor={colors.bgSurface}
                />
              </View>
              <View style={styles.logoutDivider} />

              {/* 3-Stage WhatsApp Templates */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  {locale === 'pt-BR'
                    ? 'Templates de WhatsApp (por etapa da OS)'
                    : 'WhatsApp Templates (by order stage)'}
                </Text>

                <View style={styles.templateTabsRow}>
                  {stageTabs.map((tab) => {
                    const active = activeTemplateStage === tab.key;
                    return (
                      <Pressable
                        key={tab.key}
                        onPress={() => setActiveTemplateStage(tab.key)}
                        style={[styles.templateTab, active && styles.templateTabActive]}
                      >
                        <Text
                          style={[
                            styles.templateTabText,
                            active && styles.templateTabTextActive,
                          ]}
                        >
                          {tab.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <TextInput
                  value={currentTemplateValue}
                  onChangeText={setCurrentTemplateDraft}
                  editable={isOwner}
                  multiline
                  textAlignVertical="top"
                  style={[styles.textarea, !isOwner && styles.inputReadonly]}
                />

                <View style={styles.varChipsWrap}>
                  {TEMPLATE_PLACEHOLDERS.map((pair) => {
                    const displayVar = locale === 'pt-BR' ? pair.ptBr : pair.api;
                    return (
                      <Pressable
                        key={pair.api}
                        disabled={!isOwner}
                        onPress={() => handleInsertVariable(displayVar)}
                        style={({ pressed }) => [
                          styles.varChip,
                          pressed && isOwner && styles.varChipPressed,
                        ]}
                      >
                        <Text style={styles.varChipText}>{displayVar}</Text>
                      </Pressable>
                    );
                  })}
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
                    ? 'Apenas o dono da oficina pode alterar os parâmetros da oficina.'
                    : 'Only the workshop owner can modify these settings.'}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Branding & Custom Warranty Terms Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.printHeaderTitleRow}>
              <ImagePlus size={14} color={colors.brandPrimary} strokeWidth={2.2} />
              <Text style={styles.cardOverline}>
                {locale === 'pt-BR'
                  ? 'IDENTIDADE VISUAL & TERMOS'
                  : 'SHOP BRANDING & TERMS'}
              </Text>
            </View>
          </View>

          <Text style={styles.langSubtitle}>
            {locale === 'pt-BR'
              ? 'Exibidos na página /track, no comprovante digital e no PDF de garantia da oficina.'
              : 'Displayed on /track, digital receipt, and warranty PDF.'}
          </Text>

          <View style={styles.formGap}>
            {/* Logo row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {currentLogoUrl ? (
                <Image
                  source={{ uri: currentLogoUrl }}
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: colors.borderSubtle,
                    backgroundColor: '#FFFFFF',
                  }}
                  contentFit="contain"
                />
              ) : (
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: colors.borderStrong,
                    backgroundColor: colors.bgCanvas,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ImagePlus size={22} color={colors.textMuted} />
                </View>
              )}

              {isOwner ? (
                <View style={{ flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Button
                    label={
                      currentLogoUrl
                        ? locale === 'pt-BR'
                          ? 'Trocar logo'
                          : 'Change logo'
                        : locale === 'pt-BR'
                          ? 'Escolher logo'
                          : 'Pick logo'
                    }
                    variant="secondary"
                    fullWidth={false}
                    onPress={() => void handlePickLogo()}
                  />
                  {currentLogoUrl ? (
                    <Pressable
                      onPress={() => setLogoDraft(null)}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: radius.md,
                        borderWidth: 1,
                        borderColor: colors.dangerBorder,
                        backgroundColor: colors.dangerSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Trash2 size={16} color={colors.danger} />
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <Text style={[styles.langSubtitle, { flex: 1 }]}>
                  {currentLogoUrl
                    ? locale === 'pt-BR'
                      ? 'Logo configurada pela oficina'
                      : 'Shop logo configured'
                    : locale === 'pt-BR'
                      ? 'Sem logo cadastrada'
                      : 'No logo configured'}
                </Text>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                {locale === 'pt-BR' ? 'Endereço da oficina (opcional)' : 'Shop address (optional)'}
              </Text>
              <View style={[styles.monoInputBox, !isOwner && styles.inputReadonly]}>
                <TextInput
                  value={shopAddressInput}
                  onChangeText={setShopAddressDraft}
                  placeholder="Rua das Flores, 123 - Centro"
                  placeholderTextColor={colors.textMuted}
                  editable={isOwner}
                  maxLength={300}
                  style={[styles.monoInput, { fontFamily: fonts.bodyRegular, fontSize: 13 }]}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                {locale === 'pt-BR' ? 'Horário de atendimento (opcional)' : 'Business hours (optional)'}
              </Text>
              <View style={[styles.monoInputBox, !isOwner && styles.inputReadonly]}>
                <TextInput
                  value={businessHoursInput}
                  onChangeText={setBusinessHoursDraft}
                  placeholder="Seg a Sex 8h30–18h · Sáb 8h30–13h"
                  placeholderTextColor={colors.textMuted}
                  editable={isOwner}
                  maxLength={200}
                  style={[styles.monoInput, { fontFamily: fonts.bodyRegular, fontSize: 13 }]}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                {locale === 'pt-BR'
                  ? 'Termo de garantia personalizado (opcional)'
                  : 'Custom warranty terms (optional)'}
              </Text>
              <TextInput
                value={warrantyTermsInput}
                onChangeText={setWarrantyTermsDraft}
                editable={isOwner}
                multiline
                maxLength={3000}
                textAlignVertical="top"
                placeholder={
                  locale === 'pt-BR'
                    ? 'Deixe em branco para usar o termo padrão do BenchOS nos comprovantes.'
                    : 'Leave blank to use default BenchOS warranty terms.'
                }
                placeholderTextColor={colors.textMuted}
                style={[styles.textarea, !isOwner && styles.inputReadonly]}
              />
            </View>

            {brandingFeedback ? (
              <View
                style={[
                  styles.feedbackBox,
                  brandingFeedback.type === 'success'
                    ? styles.feedbackSuccess
                    : styles.feedbackError,
                ]}
              >
                <Text
                  style={[
                    styles.feedbackText,
                    brandingFeedback.type === 'success'
                      ? styles.feedbackTextSuccess
                      : styles.feedbackTextError,
                  ]}
                >
                  {brandingFeedback.text}
                </Text>
              </View>
            ) : null}

            {isOwner ? (
              <Button
                label={locale === 'pt-BR' ? 'Salvar identidade' : 'Save branding'}
                icon={<Check size={16} color={colors.textOnDark} strokeWidth={2.4} />}
                loading={updateBrandingMutation.isPending}
                onPress={() => {
                  setBrandingFeedback(null);
                  updateBrandingMutation.mutate();
                }}
              />
            ) : null}
          </View>
        </View>

        {/* Custom Appliance Types Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardOverline}>
              {locale === 'pt-BR'
                ? 'TIPOS DE APARELHO PERSONALIZADOS'
                : 'CUSTOM APPLIANCE TYPES'}
            </Text>
          </View>

          <View style={styles.addCustomRow}>
            <TextInput
              value={newApplianceType}
              onChangeText={setNewApplianceType}
              placeholder={
                locale === 'pt-BR'
                  ? 'Ex: Máquina de Café, Purificador...'
                  : 'e.g. Espresso Machine...'
              }
              placeholderTextColor={colors.textMuted}
              style={styles.customTypeInput}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (newApplianceType.trim()) {
                  addApplianceTypeMutation.mutate(newApplianceType.trim());
                }
              }}
            />
            <Pressable
              disabled={!newApplianceType.trim() || addApplianceTypeMutation.isPending}
              onPress={() => {
                if (newApplianceType.trim()) {
                  addApplianceTypeMutation.mutate(newApplianceType.trim());
                }
              }}
              style={[
                styles.addCustomBtn,
                (!newApplianceType.trim() || addApplianceTypeMutation.isPending) &&
                  styles.addCustomBtnDisabled,
              ]}
            >
              {addApplianceTypeMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.textOnDark} />
              ) : (
                <Plus size={18} color={colors.textOnDark} strokeWidth={2.4} />
              )}
            </Pressable>
          </View>

          {customTypes.length === 0 ? (
            <Text style={styles.customEmptyText}>
              {locale === 'pt-BR'
                ? 'Nenhum tipo extra cadastrado ainda. Os tipos adicionados aqui (ou na Nova OS) ficam disponíveis para toda a equipe.'
                : 'No custom appliance types added yet. Types added here are shared with your entire team.'}
            </Text>
          ) : (
            <View style={styles.customChipsWrap}>
              {customTypes.map((typeName) => (
                <View key={typeName} style={styles.customChip}>
                  <Text style={styles.customChipText}>{typeName}</Text>
                  {isOwner ? (
                    <Pressable
                      onPress={() => removeApplianceTypeMutation.mutate(typeName)}
                      hitSlop={6}
                    >
                      <X size={13} color={colors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Intake Checklist by Category Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.printHeaderTitleRow}>
              <ClipboardCheck size={14} color={colors.brandPrimary} strokeWidth={2.2} />
              <Text style={styles.cardOverline}>
                {locale === 'pt-BR'
                  ? 'CHECKLIST DE RECEBIMENTO'
                  : 'INTAKE CHECKLIST'}
              </Text>
            </View>
            {isOwner ? (
              <Pressable
                disabled={resetChecklistsMutation.isPending}
                onPress={() => resetChecklistsMutation.mutate()}
                hitSlop={8}
                style={styles.printHeaderTitleRow}
              >
                <RotateCcw size={12} color={colors.brandPrimary} />
                <Text style={styles.addMemberLink}>
                  {locale === 'pt-BR' ? 'Padrões' : 'Defaults'}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.langSubtitle}>
            {locale === 'pt-BR'
              ? 'Itens rápidos exibidos na abertura da OS para cada categoria (ex.: retirar prato do micro-ondas).'
              : 'Quick checks displayed when opening a new order for each category.'}
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
          >
            {checklistCategories.map((cat) => {
              const active = cat === selectedChecklistCategory;
              const count = resolveChecklistForCategory(checklistTemplates, cat).length;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setSelectedChecklistCategory(cat)}
                  style={[
                    styles.customChip,
                    active && {
                      backgroundColor: colors.brandPrimarySoft,
                      borderColor: colors.brandPrimary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.customChipText,
                      active && { color: colors.brandPrimary, fontFamily: fonts.bodySemiBold },
                    ]}
                  >
                    {count > 0 ? `${cat} (${count})` : cat}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {isOwner ? (
            <View style={styles.addCustomRow}>
              <TextInput
                value={newChecklistItem}
                onChangeText={setNewChecklistItem}
                placeholder={
                  locale === 'pt-BR'
                    ? `Novo item para ${selectedChecklistCategory}...`
                    : `New check for ${selectedChecklistCategory}...`
                }
                placeholderTextColor={colors.textMuted}
                style={styles.customTypeInput}
                maxLength={160}
                returnKeyType="done"
                onSubmitEditing={handleAddChecklistItem}
              />
              <Pressable
                disabled={!newChecklistItem.trim() || updateChecklistsMutation.isPending}
                onPress={handleAddChecklistItem}
                style={[
                  styles.addCustomBtn,
                  (!newChecklistItem.trim() || updateChecklistsMutation.isPending) &&
                    styles.addCustomBtnDisabled,
                ]}
              >
                {updateChecklistsMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.textOnDark} />
                ) : (
                  <Plus size={18} color={colors.textOnDark} strokeWidth={2.4} />
                )}
              </Pressable>
            </View>
          ) : null}

          {activeChecklistItems.length === 0 ? (
            <Text style={styles.customEmptyText}>
              {locale === 'pt-BR'
                ? `Nenhum item configurado para ${selectedChecklistCategory}.`
                : `No checklist items configured for ${selectedChecklistCategory}.`}
            </Text>
          ) : (
            <View style={styles.customChipsWrap}>
              {activeChecklistItems.map((itemLabel) => (
                <View key={itemLabel} style={styles.customChip}>
                  <Text style={styles.customChipText}>✓ {itemLabel}</Text>
                  {isOwner ? (
                    <Pressable
                      disabled={updateChecklistsMutation.isPending}
                      onPress={() =>
                        mutateCategoryChecklist(
                          activeChecklistItems.filter((x) => x !== itemLabel)
                        )
                      }
                      hitSlop={6}
                    >
                      <X size={13} color={colors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Post-Delivery Appliance Care Tips Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.printHeaderTitleRow}>
              <Lightbulb size={14} color={colors.successDark} strokeWidth={2.2} />
              <Text style={styles.cardOverline}>
                {locale === 'pt-BR' ? 'DICAS DE CONSERVAÇÃO' : 'APPLIANCE CARE TIPS'}
              </Text>
            </View>
            {isOwner ? (
              <Pressable
                disabled={resetCareTipsMutation.isPending}
                onPress={() => resetCareTipsMutation.mutate()}
                hitSlop={8}
                style={styles.printHeaderTitleRow}
              >
                <RotateCcw size={12} color={colors.brandPrimary} />
                <Text style={styles.addMemberLink}>
                  {locale === 'pt-BR' ? 'Padrões' : 'Defaults'}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.langSubtitle}>
            {locale === 'pt-BR'
              ? 'Exibidas ao cliente no /track e comprovante após a entrega para aumentar a vida útil do aparelho.'
              : 'Displayed to customers on /track and receipts after delivery to help appliances last longer.'}
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
          >
            {careTipCategories.map((cat) => {
              const active = cat === selectedCareCategory;
              const count = resolveChecklistForCategory(careTipsTemplates, cat).length;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setSelectedCareCategory(cat)}
                  style={[
                    styles.customChip,
                    active && {
                      backgroundColor: colors.successSoft,
                      borderColor: colors.successBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.customChipText,
                      active && { color: colors.successDark, fontFamily: fonts.bodySemiBold },
                    ]}
                  >
                    {count > 0 ? `${cat} (${count})` : cat}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {isOwner ? (
            <View style={styles.addCustomRow}>
              <TextInput
                value={newCareTip}
                onChangeText={setNewCareTip}
                placeholder={
                  locale === 'pt-BR'
                    ? `Nova dica para ${selectedCareCategory}...`
                    : `New care tip for ${selectedCareCategory}...`
                }
                placeholderTextColor={colors.textMuted}
                style={styles.customTypeInput}
                maxLength={240}
                returnKeyType="done"
                onSubmitEditing={handleAddCareTip}
              />
              <Pressable
                disabled={!newCareTip.trim() || updateCareTipsMutation.isPending}
                onPress={handleAddCareTip}
                style={[
                  styles.addCustomBtn,
                  (!newCareTip.trim() || updateCareTipsMutation.isPending) &&
                    styles.addCustomBtnDisabled,
                ]}
              >
                {updateCareTipsMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.textOnDark} />
                ) : (
                  <Plus size={18} color={colors.textOnDark} strokeWidth={2.4} />
                )}
              </Pressable>
            </View>
          ) : null}

          {activeCareTips.length === 0 ? (
            <Text style={styles.customEmptyText}>
              {locale === 'pt-BR'
                ? `Nenhuma dica configurada para ${selectedCareCategory}.`
                : `No care tips configured for ${selectedCareCategory}.`}
            </Text>
          ) : (
            <View style={{ gap: 6 }}>
              {activeCareTips.map((tip) => (
                <View
                  key={tip}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 8,
                    backgroundColor: colors.successSoft,
                    borderWidth: 1,
                    borderColor: colors.successBorder,
                    borderRadius: radius.md,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                  }}
                >
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: fonts.bodyRegular,
                      fontSize: 12,
                      color: colors.textPrimary,
                      lineHeight: 17,
                    }}
                  >
                    • {tip}
                  </Text>
                  {isOwner ? (
                    <Pressable
                      disabled={updateCareTipsMutation.isPending}
                      onPress={() =>
                        mutateCategoryCareTips(activeCareTips.filter((x) => x !== tip))
                      }
                      hitSlop={6}
                    >
                      <X size={14} color={colors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
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
                        <View style={styles.memberActions}>
                          <Pressable
                            onPress={() => setResetPasswordMember(member)}
                            hitSlop={6}
                            accessibilityLabel={
                              locale === 'pt-BR' ? 'Redefinir senha' : 'Reset password'
                            }
                            style={({ pressed }) => [
                              styles.resetPwdBtn,
                              pressed && styles.resetPwdBtnPressed,
                            ]}
                          >
                            <KeyRound size={15} color={colors.brandPrimary} />
                          </Pressable>
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
                        </View>
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

        {/* Section 2.4: Catálogo de Peças Comuns (OWNER & TECHNICIAN) */}
        {canManagePartsCatalog ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.printHeaderTitleRow}>
                <Package size={14} color={colors.brandPrimary} strokeWidth={2.2} />
                <Text style={styles.cardOverline}>
                  {locale === 'pt-BR' ? 'CATÁLOGO DE PEÇAS COMUNS' : 'COMMON PARTS CATALOG'}
                </Text>
              </View>
              <Text style={styles.printModeBadge}>
                {partsCatalogQuery.isLoading
                  ? '...'
                  : `${partsCatalogQuery.data?.length ?? 0}`}
              </Text>
            </View>

            <Text style={styles.langSubtitle}>
              {locale === 'pt-BR'
                ? 'Cadastre peças frequentes (magnetron, fusível, capacitor, resistência) com custo médio e valor de repasse para orçar em 1 toque e calcular a margem real.'
                : 'Register common parts with average cost and suggested price for 1-tap quoting and real margin tracking.'}
            </Text>

            <Button
              label={
                locale === 'pt-BR'
                  ? 'Gerenciar catálogo de peças'
                  : 'Manage parts catalog'
              }
              variant="secondary"
              icon={<Package size={15} color={colors.textPrimary} />}
              onPress={() => setPartsCatalogModalOpen(true)}
            />
          </View>
        ) : null}

        {/* Section 2.5: Etiquetas & Impressão (Per-device configurable) */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.printHeaderTitleRow}>
              <Printer size={14} color={colors.brandPrimary} strokeWidth={2.2} />
              <Text style={styles.cardOverline}>
                {locale === 'pt-BR' ? 'ETIQUETAS & IMPRESSÃO' : 'LABELS & PRINTING'}
              </Text>
            </View>
            <Text style={styles.printModeBadge}>
              {printMode === 'DISABLED'
                ? locale === 'pt-BR'
                  ? 'Desativado'
                  : 'Off'
                : printMode === 'A4'
                  ? 'A4'
                  : '58mm'}
            </Text>
          </View>

          <Text style={styles.langSubtitle}>
            {locale === 'pt-BR'
              ? 'Escolha se esta oficina usa etiquetas físicas com QR Code. Quando desativado, os botões de impressão ficam ocultos.'
              : 'Choose whether this workshop prints QR labels. When off, print buttons stay hidden.'}
          </Text>

          <View style={styles.printModesRow}>
            {(
              [
                {
                  key: 'DISABLED',
                  label: locale === 'pt-BR' ? 'Desativado' : 'Off',
                },
                {
                  key: 'A4',
                  label: locale === 'pt-BR' ? 'Papel A4' : 'A4 Paper',
                },
                {
                  key: 'THERMAL_58MM',
                  label: locale === 'pt-BR' ? 'Térmica 58mm' : '58mm Thermal',
                },
              ] as { key: PrintLabelMode; label: string }[]
            ).map((opt) => {
              const active = printMode === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setPrintMode(opt.key)}
                  style={[styles.printModeBtn, active && styles.printModeBtnActive]}
                >
                  <Text style={[styles.printModeBtnText, active && styles.printModeBtnTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.printModeHint}>
            {printMode === 'DISABLED'
              ? locale === 'pt-BR'
                ? 'Ideal para oficinas que controlam as etiquetas à mão ou só usam WhatsApp.'
                : 'Best for workshops that label items manually or only use WhatsApp.'
              : printMode === 'A4'
                ? locale === 'pt-BR'
                  ? 'Gera folha A4 recortável em PDF para impressoras comuns (jato de tinta ou laser).'
                  : 'Generates cut-out A4 PDF label sheets for standard printers.'
                : locale === 'pt-BR'
                  ? 'Layout 58mm preto e branco de alto contraste. Compatível com impressoras térmicas Bluetooth/Wi-Fi via Impressão do Android ou app RawBT.'
                  : 'High-contrast 58mm B&W layout compatible with Bluetooth/Wi-Fi thermal printers via Android Print or RawBT.'}
          </Text>

          <View style={styles.logoutDivider} />

          <View style={styles.langRow}>
            <View style={styles.langCopy}>
              <View style={styles.printHeaderTitleRow}>
                <QrCode size={14} color={colors.textPrimary} strokeWidth={2.1} />
                <Text style={styles.langTitle}>
                  {locale === 'pt-BR' ? 'Leitor de QR Code na Bancada' : 'Workbench QR Scanner'}
                </Text>
              </View>
              <Text style={styles.langSubtitle}>
                {locale === 'pt-BR'
                  ? 'Exibe atalho de câmera no topo da Bancada para abrir a OS pela etiqueta'
                  : 'Shows a camera shortcut on the Workbench header to open items from labels'}
              </Text>
            </View>
            <Switch
              value={scannerEnabled}
              onValueChange={setScannerEnabled}
              trackColor={{
                false: colors.borderStrong,
                true: colors.brandPrimary,
              }}
              thumbColor={colors.bgSurface}
            />
          </View>

          {isPrintEnabled && session?.tenant ? (
            <Button
              label={
                locale === 'pt-BR'
                  ? `Testar etiqueta de exemplo (${printMode === 'THERMAL_58MM' ? '58mm' : 'A4'})`
                  : `Test sample label (${printMode === 'THERMAL_58MM' ? '58mm' : 'A4'})`
              }
              variant="secondary"
              loading={testingSampleLabel}
              icon={<Printer size={15} color={colors.textPrimary} />}
              onPress={() => {
                if (printMode === 'DISABLED' || !session?.tenant) return;
                setTestingSampleLabel(true);
                void shareSampleLabelPdf({
                  tenant: session.tenant,
                  mode: printMode,
                  locale,
                })
                  .catch((err) => {
                    Alert.alert(
                      locale === 'pt-BR' ? 'Erro ao gerar etiqueta' : 'Could not generate label',
                      err instanceof Error ? err.message : t.common.errorGeneric
                    );
                  })
                  .finally(() => {
                    setTestingSampleLabel(false);
                  });
              }}
            />
          ) : null}
        </View>

        {/* Section 3: App Preferences & Logout */}
        <View style={styles.card}>
          <View style={styles.langRow}>
            <View style={styles.langCopy}>
              <Text style={styles.langTitle}>
                {locale === 'pt-BR' ? 'Notificações push' : 'Push notifications'}
              </Text>
              <Text style={styles.langSubtitle}>
                {pushStatus === 'registered'
                  ? locale === 'pt-BR'
                    ? 'Ativas: orçamentos no /track e alertas diários'
                    : 'Active: quote approvals and daily alerts'
                  : pushStatus === 'denied'
                    ? locale === 'pt-BR'
                      ? 'Permissão negada no sistema'
                      : 'System permission denied'
                    : pushStatus === 'unsupported'
                      ? locale === 'pt-BR'
                        ? 'Disponível no app instalado (APK)'
                        : 'Available in installed app build'
                      : locale === 'pt-BR'
                        ? 'Receba alertas de aprovação e vencimentos'
                        : 'Receive quote and due-date alerts'}
              </Text>
            </View>

            {pushStatus === 'registered' ? (
              <View style={styles.activePill}>
                <View style={styles.activeDot} />
                <Text style={styles.activePillText}>
                  {locale === 'pt-BR' ? 'Ativo' : 'Active'}
                </Text>
              </View>
            ) : pushStatus === 'denied' ? (
              <Pressable
                onPress={() => {
                  void Linking.openSettings();
                }}
                style={styles.pushActionBtn}
              >
                <Text style={styles.pushActionBtnText}>
                  {locale === 'pt-BR' ? 'Ajustes' : 'Settings'}
                </Text>
              </Pressable>
            ) : pushStatus !== 'unsupported' ? (
              <Pressable
                disabled={isPushBusy}
                onPress={() => {
                  void enableNotifications();
                }}
                style={[styles.pushActionBtn, isPushBusy && styles.addCustomBtnDisabled]}
              >
                {isPushBusy ? (
                  <ActivityIndicator size="small" color={colors.brandPrimary} />
                ) : (
                  <Text style={styles.pushActionBtnText}>
                    {locale === 'pt-BR' ? 'Ativar' : 'Enable'}
                  </Text>
                )}
              </Pressable>
            ) : null}
          </View>

          <View style={styles.logoutDivider} />

          <View style={styles.langRow}>
            <View style={styles.langCopy}>
              <Text style={styles.langTitle}>
                {locale === 'pt-BR' ? 'Modo offline (cache local)' : 'Offline mode (local cache)'}
              </Text>
              <Text style={styles.langSubtitle}>
                {isOffline
                  ? locale === 'pt-BR'
                    ? 'Sem internet · exibindo dados salvos no aparelho'
                    : 'Offline · showing cached data on device'
                  : cacheStatsQuery.data?.hasCache
                    ? locale === 'pt-BR'
                      ? `Online · ~${cacheStatsQuery.data.sizeKb} KB salvos para consulta sem Wi-Fi`
                      : `Online · ~${cacheStatsQuery.data.sizeKb} KB cached for offline reading`
                    : locale === 'pt-BR'
                      ? 'Online · cache preenchido automaticamente ao navegar'
                      : 'Online · cache populates automatically as you browse'}
              </Text>
            </View>

            <Pressable
              disabled={clearingCache || isOffline}
              onPress={() => {
                Alert.alert(
                  locale === 'pt-BR' ? 'Limpar cache local?' : 'Clear local cache?',
                  locale === 'pt-BR'
                    ? 'Os dados salvos para leitura offline serão removidos e recarregados da internet.'
                    : 'Cached offline data will be removed and reloaded from the server.',
                  [
                    { text: t.common.cancel, style: 'cancel' },
                    {
                      text: locale === 'pt-BR' ? 'Limpar' : 'Clear',
                      onPress: () => {
                        setClearingCache(true);
                        void clearPersistedQueryCache()
                          .then(async () => {
                            await queryClient.invalidateQueries();
                            await cacheStatsQuery.refetch();
                          })
                          .finally(() => {
                            setClearingCache(false);
                          });
                      },
                    },
                  ]
                );
              }}
              style={[
                styles.pushActionBtn,
                (clearingCache || isOffline) && styles.addCustomBtnDisabled,
              ]}
            >
              {clearingCache ? (
                <ActivityIndicator size="small" color={colors.brandPrimary} />
              ) : (
                <Text style={styles.pushActionBtnText}>
                  {locale === 'pt-BR' ? 'Limpar' : 'Clear'}
                </Text>
              )}
            </Pressable>
          </View>

          <View style={styles.logoutDivider} />

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

          <View style={styles.langRow}>
            <View style={styles.langCopy}>
              <View style={styles.printHeaderTitleRow}>
                <BookOpen size={14} color={colors.brandPrimary} strokeWidth={2.1} />
                <Text style={styles.langTitle}>
                  {locale === 'pt-BR' ? 'Central Como Usar' : 'How to Use Guide'}
                </Text>
              </View>
              <Text style={styles.langSubtitle}>
                {locale === 'pt-BR'
                  ? 'Guias rápidos de balcão, peças, Pix e etiquetas'
                  : 'Quick guides for orders, parts, Pix, and labels'}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                void Linking.openURL('https://benchos.app.br/como-usar');
              }}
              style={styles.pushActionBtn}
            >
              <Text style={styles.pushActionBtnText}>
                {locale === 'pt-BR' ? 'Abrir' : 'Open'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.logoutDivider} />

          <View style={styles.langRow}>
            <View style={styles.langCopy}>
              <View style={styles.printHeaderTitleRow}>
                <ShieldCheck size={14} color={colors.textPrimary} strokeWidth={2.1} />
                <Text style={styles.langTitle}>
                  {locale === 'pt-BR' ? 'Privacidade & Termos' : 'Privacy & Terms'}
                </Text>
              </View>
              <Text style={styles.langSubtitle}>
                {locale === 'pt-BR'
                  ? 'Política de Privacidade (LGPD) em benchos.app.br'
                  : 'Privacy Policy at benchos.app.br'}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                void Linking.openURL('https://benchos.app.br/privacidade');
              }}
              style={styles.pushActionBtn}
            >
              <Text style={styles.pushActionBtnText}>
                {locale === 'pt-BR' ? 'Ver' : 'View'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.logoutDivider} />

          <View style={styles.langRow}>
            <View style={styles.langCopy}>
              <View style={styles.printHeaderTitleRow}>
                <Trash2 size={14} color={colors.danger} strokeWidth={2.1} />
                <Text style={styles.langTitle}>
                  {locale === 'pt-BR' ? 'Excluir conta e dados' : 'Delete account & data'}
                </Text>
              </View>
              <Text style={styles.langSubtitle}>
                {locale === 'pt-BR'
                  ? 'Solicite a exclusão definitiva da conta e dos dados (LGPD)'
                  : 'Request permanent account and data deletion'}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                void Linking.openURL('https://benchos.app.br/excluir-conta');
              }}
              style={styles.pushActionBtn}
            >
              <Text style={styles.pushActionBtnText}>
                {locale === 'pt-BR' ? 'Abrir' : 'Open'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.logoutDivider} />

          <Button
            label={locale === 'pt-BR' ? 'Sair da conta' : 'Sign out'}
            variant="dangerOutline"
            icon={<LogOut size={16} color={colors.danger} strokeWidth={2.2} />}
            onPress={handleSignOut}
          />

          <Text style={styles.appVersionFooter}>
            {`BenchOS ${getAppVersionLabel()}${
              isSentryConfigured()
                ? locale === 'pt-BR'
                  ? ' · Monitoramento ativo'
                  : ' · Monitoring active'
                : ''
            }`}
          </Text>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {isOwner ? (
        <>
          <TeamMemberModal
            visible={memberModalOpen}
            onClose={() => setMemberModalOpen(false)}
          />
          <ResetMemberPasswordModal
            visible={resetPasswordMember !== null}
            member={resetPasswordMember}
            onClose={() => setResetPasswordMember(null)}
          />
        </>
      ) : null}

      {canManagePartsCatalog ? (
        <PartsCatalogModal
          visible={partsCatalogModalOpen}
          onClose={() => setPartsCatalogModalOpen(false)}
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
  flex: {
    flex: 1,
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
    gap: 6,
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
  templateTabsRow: {
    flexDirection: 'row',
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.md,
    padding: 3,
    gap: 4,
  },
  templateTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
  },
  templateTabActive: {
    backgroundColor: colors.bgSurface,
  },
  templateTabText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textMuted,
  },
  templateTabTextActive: {
    fontFamily: fonts.bodySemiBold,
    color: colors.brandPrimary,
  },
  textarea: {
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: 12,
    minHeight: 96,
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 19,
  },
  varChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
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
  addCustomRow: {
    flexDirection: 'row',
    gap: 8,
  },
  customTypeInput: {
    flex: 1,
    minHeight: 42,
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textPrimary,
  },
  addCustomBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCustomBtnDisabled: {
    opacity: 0.5,
  },
  customEmptyText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  customChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  customChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  customChipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textPrimary,
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
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resetPwdBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetPwdBtnPressed: {
    opacity: 0.75,
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
  pushActionBtn: {
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minWidth: 74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pushActionBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.brandPrimary,
  },
  printHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  printModeBadge: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    color: colors.brandPrimary,
    backgroundColor: colors.brandPrimarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  printModesRow: {
    flexDirection: 'row',
    gap: 6,
  },
  printModeBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgCanvas,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  printModeBtnActive: {
    backgroundColor: colors.brandPrimarySoft,
    borderColor: colors.brandPrimary,
  },
  printModeBtnText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  printModeBtnTextActive: {
    fontFamily: fonts.bodySemiBold,
    color: colors.brandPrimary,
  },
  printModeHint: {
    fontFamily: fonts.bodyRegular,
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  appVersionFooter: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
