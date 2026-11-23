import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronRight,
  Lock,
  MessageCircle,
  MoreVertical,
  Pencil,
  ShieldCheck,
  Trash2,
  User,
  X,
} from 'lucide-react-native';
import { ordersApi, photosApi } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { QuoteEditModal } from '@/components/orders/QuoteEditModal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TagBadge } from '@/components/ui/TagBadge';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { ItemPhotoResponse, ItemStatus, PhotoStage } from '@/types/api';
import { compressAndUploadItemPhoto } from '@/utils/imageUpload';

const PROGRESS_STEPS: { labelPt: string; labelEn: string }[] = [
  { labelPt: 'Recebido', labelEn: 'Received' },
  { labelPt: 'Diag.', labelEn: 'Diag.' },
  { labelPt: 'Aprovado', labelEn: 'Approved' },
  { labelPt: 'Conserto', labelEn: 'Repair' },
  { labelPt: 'Pronto', labelEn: 'Ready' },
];

function getProgressStepIndex(status: ItemStatus): number {
  switch (status) {
    case 'RECEIVED':
      return 0;
    case 'DIAGNOSING':
    case 'QUOTE_SENT':
      return 1;
    case 'APPROVED':
    case 'WAITING_PARTS':
      return 2;
    case 'IN_REPAIR':
      return 3;
    case 'READY_FOR_PICKUP':
    case 'DELIVERED':
      return 4;
    default:
      return -1;
  }
}

export default function ApplianceDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { orderId, itemId } = useLocalSearchParams<{ orderId: string; itemId: string }>();
  const { t, locale, formatCurrency, formatPhone, formatShortDate } = useI18n();

  const [selectedPhotoStage, setSelectedPhotoStage] = useState<PhotoStage>('INTAKE');
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [previewPhoto, setPreviewPhoto] = useState<ItemPhotoResponse | null>(null);

  const orderQuery = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => ordersApi.get(orderId),
    enabled: Boolean(orderId),
  });

  const photosQuery = useQuery({
    queryKey: ['item-photos', orderId, itemId],
    queryFn: () => photosApi.list(orderId, itemId),
    enabled: Boolean(orderId && itemId),
  });

  const order = orderQuery.data;
  const item = useMemo(
    () => order?.items.find((i) => i.id === itemId),
    [order, itemId]
  );

  const photosByStage = useMemo(() => {
    const grouped: Record<PhotoStage, ItemPhotoResponse[]> = {
      INTAKE: [],
      DIAGNOSIS: [],
      COMPLETED: [],
    };
    for (const p of photosQuery.data ?? []) {
      grouped[p.stage]?.push(p);
    }
    return grouped;
  }, [photosQuery.data]);

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    void queryClient.invalidateQueries({ queryKey: ['bench-queue'] });
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
  };

  const transitionMutation = useMutation({
    mutationFn: ({ status, cancellationReason }: { status: ItemStatus; cancellationReason?: string }) =>
      ordersApi.transitionStatus(orderId, itemId, { status, cancellationReason }),
    onSuccess: () => {
      invalidateAll();
      setCancelModalOpen(false);
      setCancelReason('');
    },
    onError: (err) => {
      Alert.alert(
        locale === 'pt-BR' ? 'Ação não permitida' : 'Action not allowed',
        err instanceof ApiError ? err.message : t.common.errorGeneric
      );
    },
  });

  const whatsappMutation = useMutation({
    mutationFn: () => ordersApi.getWhatsappLink(orderId, itemId),
    onSuccess: (res) => {
      void Linking.openURL(res.whatsappUrl);
    },
    onError: (err) => {
      Alert.alert('WhatsApp', err instanceof ApiError ? err.message : t.common.errorGeneric);
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: (photoId: string) => photosApi.remove(orderId, itemId, photoId),
    onSuccess: () => {
      setPreviewPhoto(null);
      void queryClient.invalidateQueries({ queryKey: ['item-photos', orderId, itemId] });
    },
  });

  const handleAddPhoto = async () => {
    const capture = async (source: 'camera' | 'library') => {
      try {
        const perm =
          source === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return;

        const result =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
            : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });

        if (result.canceled || !result.assets[0]?.uri) return;

        setUploadingPhoto(true);
        await compressAndUploadItemPhoto(orderId, itemId, result.assets[0].uri, selectedPhotoStage);
        void queryClient.invalidateQueries({ queryKey: ['item-photos', orderId, itemId] });
      } catch (err) {
        Alert.alert(
          locale === 'pt-BR' ? 'Erro no upload' : 'Upload failed',
          err instanceof ApiError ? err.message : t.common.errorGeneric
        );
      } finally {
        setUploadingPhoto(false);
      }
    };

    Alert.alert(
      locale === 'pt-BR'
        ? `Nova foto (${t.photoStage[selectedPhotoStage]})`
        : `Add photo (${t.photoStage[selectedPhotoStage]})`,
      locale === 'pt-BR' ? 'Escolha a origem da imagem' : 'Choose image source',
      [
        { text: locale === 'pt-BR' ? 'Câmera' : 'Camera', onPress: () => void capture('camera') },
        { text: locale === 'pt-BR' ? 'Galeria' : 'Gallery', onPress: () => void capture('library') },
        { text: t.common.cancel, style: 'cancel' },
      ]
    );
  };

  const handleOverflowMenu = () => {
    if (!order || !item) return;
    const isTerminal =
      item.status === 'DELIVERED' || item.status === 'DISCARDED' || item.status === 'CANCELLED';

    const options: { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void }[] = [
      {
        text:
          locale === 'pt-BR'
            ? 'Ver página pública do cliente'
            : 'Preview public tracking page',
        onPress: () =>
          router.push({
            pathname: '/track/[publicToken]',
            params: { publicToken: order.publicToken },
          }),
      },
    ];

    if (item.status === 'READY_FOR_PICKUP' || item.status === 'REJECTED') {
      options.push({
        text: locale === 'pt-BR' ? 'Marcar como Descartado (abandono)' : 'Mark as Discarded',
        style: 'destructive',
        onPress: () => transitionMutation.mutate({ status: 'DISCARDED' }),
      });
    }

    if (!isTerminal) {
      options.push({
        text: locale === 'pt-BR' ? 'Cancelar aparelho' : 'Cancel item',
        style: 'destructive',
        onPress: () => setCancelModalOpen(true),
      });
    }

    options.push({ text: t.common.cancel, style: 'cancel' });
    Alert.alert(`#${item.tag}`, undefined, options);
  };

  if (orderQuery.isLoading) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </SafeAreaView>
    );
  }

  if (orderQuery.isError || !order || !item) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <Text style={styles.errorTitle}>
          {locale === 'pt-BR' ? 'Aparelho não encontrado' : 'Appliance not found'}
        </Text>
        <Button label={t.common.back} variant="secondary" fullWidth={false} onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const applianceTitle = [item.applianceType, item.brand, item.model].filter(Boolean).join(' ');
  const activeStep = getProgressStepIndex(item.status);
  const isQuoteEditable = item.status === 'DIAGNOSING' || item.status === 'QUOTE_SENT';
  const isQuoteLocked =
    item.status === 'APPROVED' || item.status === 'WAITING_PARTS' || item.status === 'IN_REPAIR';
  const currentStagePhotos = photosByStage[selectedPhotoStage];

  const renderPrimaryAction = () => {
    const busy = transitionMutation.isPending;

    switch (item.status) {
      case 'RECEIVED':
        return (
          <Button
            label={locale === 'pt-BR' ? 'Iniciar Diagnóstico' : 'Start Diagnosis'}
            loading={busy}
            onPress={() => transitionMutation.mutate({ status: 'DIAGNOSING' })}
            style={styles.primaryBarBtn}
          />
        );
      case 'DIAGNOSING':
        return (
          <Button
            label={locale === 'pt-BR' ? 'Enviar Orçamento' : 'Send Quote'}
            loading={busy}
            onPress={() => transitionMutation.mutate({ status: 'QUOTE_SENT' })}
            style={styles.primaryBarBtn}
          />
        );
      case 'QUOTE_SENT':
        return (
          <View style={styles.dualDecisionRow}>
            <Button
              label={locale === 'pt-BR' ? 'Recusar' : 'Reject'}
              variant="dangerOutline"
              loading={busy}
              onPress={() => transitionMutation.mutate({ status: 'REJECTED' })}
              style={styles.decisionHalfBtn}
            />
            <Button
              label={locale === 'pt-BR' ? 'Aprovar' : 'Approve'}
              loading={busy}
              onPress={() => transitionMutation.mutate({ status: 'APPROVED' })}
              style={styles.decisionHalfBtn}
            />
          </View>
        );
      case 'APPROVED':
        return (
          <View style={styles.dualDecisionRow}>
            <Button
              label={locale === 'pt-BR' ? 'Peça' : 'Parts'}
              variant="secondary"
              loading={busy}
              onPress={() => transitionMutation.mutate({ status: 'WAITING_PARTS' })}
              style={styles.decisionHalfBtn}
            />
            <Button
              label={locale === 'pt-BR' ? 'Consertar' : 'Repair'}
              loading={busy}
              onPress={() => transitionMutation.mutate({ status: 'IN_REPAIR' })}
              style={styles.decisionHalfBtn}
            />
          </View>
        );
      case 'WAITING_PARTS':
        return (
          <Button
            label={locale === 'pt-BR' ? 'Iniciar Conserto' : 'Start Repair'}
            loading={busy}
            onPress={() => transitionMutation.mutate({ status: 'IN_REPAIR' })}
            style={styles.primaryBarBtn}
          />
        );
      case 'IN_REPAIR':
        return (
          <Button
            label={locale === 'pt-BR' ? 'Marcar Pronto' : 'Mark Ready'}
            loading={busy}
            icon={<CheckCircle2 size={17} color={colors.textOnDark} />}
            onPress={() => transitionMutation.mutate({ status: 'READY_FOR_PICKUP' })}
            style={styles.primaryBarBtn}
          />
        );
      case 'READY_FOR_PICKUP':
      case 'REJECTED':
        return (
          <Button
            label={
              item.status === 'REJECTED'
                ? locale === 'pt-BR'
                  ? 'Devolver s/ Custo'
                  : 'Return Free'
                : locale === 'pt-BR'
                  ? 'Registrar Entrega'
                  : 'Deliver Item'
            }
            icon={<CheckCircle2 size={17} color={colors.textOnDark} />}
            onPress={() =>
              router.push({
                pathname: '/orders/[orderId]/items/[itemId]/deliver',
                params: { orderId, itemId },
              })
            }
            style={styles.primaryBarBtn}
          />
        );
      default:
        return (
          <View style={styles.terminalChip}>
            <Text style={styles.terminalText}>{t.status[item.status]}</Text>
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.navIconBtn} hitSlop={8}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.topTagPair}>
          <TagBadge label={`#${item.tag}`} variant="dark" />
          <TagBadge label={t.voltage[item.voltage]} variant="subtle" />
        </View>
        <Pressable onPress={handleOverflowMenu} style={styles.navIconBtn} hitSlop={8}>
          <MoreVertical size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={orderQuery.isRefetching}
            onRefresh={() => {
              void orderQuery.refetch();
              void photosQuery.refetch();
            }}
            tintColor={colors.brandPrimary}
          />
        }
      >
        {/* Summary Card */}
        <Card padded={false} style={styles.summaryCard}>
          <View style={styles.summaryBody}>
            <View style={styles.summaryTopRow}>
              <StatusBadge status={item.status} />
              <Text style={styles.orderNumberMono}>OS #{order.orderNumber}</Text>
            </View>

            <Text style={styles.applianceTitle}>{applianceTitle}</Text>

            {/* 5-step progress stepper */}
            <View style={styles.stepperBlock}>
              <View style={styles.stepperBars}>
                {PROGRESS_STEPS.map((_, idx) => {
                  const filled = activeStep >= idx;
                  return (
                    <View
                      key={idx}
                      style={[
                        styles.stepBar,
                        filled && styles.stepBarFilled,
                        item.status === 'REJECTED' || item.status === 'CANCELLED'
                          ? styles.stepBarDanger
                          : null,
                      ]}
                    />
                  );
                })}
              </View>
              <View style={styles.stepperLabels}>
                {PROGRESS_STEPS.map((step, idx) => (
                  <Text
                    key={step.labelEn}
                    numberOfLines={1}
                    style={[
                      styles.stepLabel,
                      activeStep === idx && styles.stepLabelActive,
                    ]}
                  >
                    {locale === 'pt-BR' ? step.labelPt : step.labelEn}
                  </Text>
                ))}
              </View>
            </View>
          </View>

          {/* Customer strip */}
          <View style={styles.customerStrip}>
            <View style={styles.customerLeft}>
              <View style={styles.customerIconBox}>
                <User size={15} color={colors.brandPrimary} />
              </View>
              <View>
                <Text style={styles.customerName}>{order.customerName ?? '—'}</Text>
                <Text style={styles.customerPhone}>{formatPhone(order.customerPhone)}</Text>
              </View>
            </View>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/track/[publicToken]',
                  params: { publicToken: order.publicToken },
                })
              }
              style={styles.publicLinkChip}
            >
              <Text style={styles.publicLinkText}>
                {locale === 'pt-BR' ? 'Ver link' : 'Track'}
              </Text>
              <ChevronRight size={13} color={colors.brandPrimary} />
            </Pressable>
          </View>
        </Card>

        {/* Diagnostics Card */}
        <Card style={styles.diagnosticsCard}>
          <View style={styles.diagBlock}>
            <Text style={styles.sectionOverline}>
              {locale === 'pt-BR' ? 'DEFEITO RELATADO' : 'REPORTED ISSUE'}
            </Text>
            <Text style={styles.diagText}>{item.reportedIssue}</Text>
            {item.accessories ? (
              <Text style={styles.accessoriesText}>
                {locale === 'pt-BR' ? 'Acessórios: ' : 'Accessories: '}
                {item.accessories}
              </Text>
            ) : null}
          </View>

          <View style={styles.divider} />

          <View style={styles.diagBlock}>
            <View style={styles.sectionHeaderBetween}>
              <Text style={styles.sectionOverline}>
                {locale === 'pt-BR' ? 'DIAGNÓSTICO TÉCNICO' : 'TECHNICAL DIAGNOSIS'}
              </Text>
              {isQuoteEditable ? (
                <Pressable onPress={() => setQuoteModalOpen(true)} style={styles.inlineEditBtn}>
                  <Pencil size={12} color={colors.brandPrimary} />
                  <Text style={styles.inlineEditText}>{t.common.edit}</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={[styles.diagText, !item.technicalDiagnosis && styles.mutedText]}>
              {item.technicalDiagnosis ||
                (locale === 'pt-BR'
                  ? 'Nenhum diagnóstico técnico registrado ainda.'
                  : 'No technical diagnosis recorded yet.')}
            </Text>
          </View>

          {item.cancellationReason ? (
            <>
              <View style={styles.divider} />
              <View style={styles.diagBlock}>
                <Text style={[styles.sectionOverline, { color: colors.danger }]}>
                  {locale === 'pt-BR' ? 'MOTIVO DO CANCELAMENTO' : 'CANCELLATION REASON'}
                </Text>
                <Text style={styles.diagText}>{item.cancellationReason}</Text>
              </View>
            </>
          ) : null}
        </Card>

        {/* Photos Card */}
        <Card style={styles.photosCard}>
          <View style={styles.sectionHeaderBetween}>
            <Text style={styles.cardSectionTitle}>
              {locale === 'pt-BR' ? 'Fotos do Aparelho' : 'Appliance Photos'}
            </Text>
            <Pressable
              onPress={() => void handleAddPhoto()}
              disabled={uploadingPhoto}
              style={styles.addPhotoPill}
            >
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color={colors.brandPrimary} />
              ) : (
                <>
                  <Camera size={13} color={colors.infoDark} />
                  <Text style={styles.addPhotoPillText}>
                    {locale === 'pt-BR' ? '+ Foto' : '+ Photo'}
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          {/* Segmented Stage Tabs */}
          <View style={styles.stageTabs}>
            {(['INTAKE', 'DIAGNOSIS', 'COMPLETED'] as PhotoStage[]).map((stage) => {
              const active = selectedPhotoStage === stage;
              const shortLabel =
                locale === 'pt-BR'
                  ? stage === 'INTAKE'
                    ? 'Entrada'
                    : stage === 'DIAGNOSIS'
                      ? 'Diag.'
                      : 'Final'
                  : t.photoStage[stage];
              return (
                <Pressable
                  key={stage}
                  onPress={() => setSelectedPhotoStage(stage)}
                  style={[styles.stageTab, active && styles.stageTabActive]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.stageTabText, active && styles.stageTabTextActive]}
                  >
                    {shortLabel} ({photosByStage[stage].length})
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Thumbnail Grid */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoGridRow}
          >
            {currentStagePhotos.map((photo) => (
              <Pressable
                key={photo.id}
                onPress={() => setPreviewPhoto(photo)}
                style={styles.photoThumb}
              >
                <Image
                  source={{ uri: photo.viewUrl }}
                  style={styles.photoImage}
                  contentFit="cover"
                />
              </Pressable>
            ))}

            <Pressable
              onPress={() => void handleAddPhoto()}
              disabled={uploadingPhoto}
              style={styles.addPhotoTile}
            >
              <Camera size={20} color={colors.brandPrimary} />
              <Text style={styles.addPhotoTileText}>
                {locale === 'pt-BR' ? '+ Adicionar' : '+ Add'}
              </Text>
            </Pressable>
          </ScrollView>
        </Card>

        {/* Quote & Pricing Card */}
        <Card style={styles.quoteCard}>
          <View style={styles.sectionHeaderBetween}>
            <Text style={styles.cardSectionTitle}>
              {locale === 'pt-BR' ? 'Orçamento' : 'Quote'}
            </Text>
            <View style={styles.quoteHeaderRight}>
              {isQuoteLocked ? (
                <>
                  <View style={styles.lockPill}>
                    <Lock size={11} color={colors.textSecondary} />
                    <Text style={styles.lockText}>
                      {locale === 'pt-BR' ? 'Travado' : 'Locked'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => transitionMutation.mutate({ status: 'QUOTE_SENT' })}
                    hitSlop={8}
                  >
                    <Text style={styles.reopenLink}>
                      {locale === 'pt-BR' ? 'Reabrir' : 'Reopen'}
                    </Text>
                  </Pressable>
                </>
              ) : isQuoteEditable ? (
                <Pressable onPress={() => setQuoteModalOpen(true)} style={styles.inlineEditBtn}>
                  <Pencil size={13} color={colors.brandPrimary} />
                  <Text style={styles.reopenLink}>
                    {locale === 'pt-BR' ? 'Editar valores' : 'Edit quote'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.priceRows}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>
                {locale === 'pt-BR' ? 'Mão de obra' : 'Labor'}
              </Text>
              <Text style={styles.priceValue}>{formatCurrency(item.laborCost)}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>{locale === 'pt-BR' ? 'Peças' : 'Parts'}</Text>
              <Text style={styles.priceValue}>{formatCurrency(item.partsCost)}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>
                {locale === 'pt-BR' ? 'Desconto' : 'Discount'}
              </Text>
              <Text style={[styles.priceValue, styles.discountValue]}>
                - {formatCurrency(item.discount)}
              </Text>
            </View>
          </View>

          <View style={styles.boldDivider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalAmount}>{formatCurrency(item.totalPrice)}</Text>
          </View>

          <View style={styles.metaPillsRow}>
            <View style={styles.metaPill}>
              <ShieldCheck size={13} color={colors.textSecondary} />
              <Text style={styles.metaPillText}>
                {locale === 'pt-BR'
                  ? `Garantia: ${item.warrantyDays} dias`
                  : `Warranty: ${item.warrantyDays}d`}
              </Text>
            </View>
            {item.estimatedCompletionDate ? (
              <View style={styles.metaPill}>
                <Calendar size={13} color={colors.textSecondary} />
                <Text style={styles.metaPillText}>
                  {locale === 'pt-BR' ? 'Prazo: ' : 'Due: '}
                  {formatShortDate(item.estimatedCompletionDate)}
                </Text>
              </View>
            ) : null}
          </View>
        </Card>
      </ScrollView>

      {/* Sticky Bottom Action Bar */}
      <View style={styles.stickyBar}>
        <Button
          label="WhatsApp"
          variant="whatsapp"
          fullWidth={false}
          loading={whatsappMutation.isPending}
          onPress={() => whatsappMutation.mutate()}
          icon={<MessageCircle size={17} color={colors.successDark} />}
          style={styles.whatsappBarBtn}
        />
        {renderPrimaryAction()}
      </View>

      {/* Quote Editor Modal */}
      <QuoteEditModal
        visible={quoteModalOpen}
        orderId={orderId}
        item={item}
        onClose={() => setQuoteModalOpen(false)}
      />

      {/* Cancellation Reason Modal */}
      <Modal
        visible={cancelModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Card style={styles.cancelModalCard}>
            <Text style={styles.cardSectionTitle}>
              {locale === 'pt-BR' ? 'Cancelar aparelho' : 'Cancel item'}
            </Text>
            <Text style={styles.mutedText}>
              {locale === 'pt-BR'
                ? 'Informe o motivo do cancelamento (obrigatório).'
                : 'Please provide a cancellation reason.'}
            </Text>
            <TextInput
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder={
                locale === 'pt-BR'
                  ? 'Ex: Cliente desistiu antes do diagnóstico'
                  : 'Reason for cancellation...'
              }
              placeholderTextColor={colors.textMuted}
              multiline
              style={styles.cancelInput}
            />
            <View style={styles.cancelActions}>
              <Button
                label={t.common.cancel}
                variant="secondary"
                fullWidth={false}
                onPress={() => setCancelModalOpen(false)}
                style={styles.flex}
              />
              <Button
                label={locale === 'pt-BR' ? 'Confirmar' : 'Confirm'}
                variant="dangerOutline"
                fullWidth={false}
                loading={transitionMutation.isPending}
                onPress={() => {
                  if (!cancelReason.trim()) return;
                  transitionMutation.mutate({
                    status: 'CANCELLED',
                    cancellationReason: cancelReason.trim(),
                  });
                }}
                style={styles.flex}
              />
            </View>
          </Card>
        </View>
      </Modal>

      {/* Fullscreen Photo Preview Modal */}
      <Modal
        visible={previewPhoto !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewPhoto(null)}
      >
        <View style={styles.photoViewerBackdrop}>
          <SafeAreaView style={styles.photoViewerSafe}>
            <View style={styles.photoViewerHeader}>
              <TagBadge
                label={previewPhoto ? t.photoStage[previewPhoto.stage] : ''}
                variant="dark"
              />
              <View style={styles.photoViewerActions}>
                <Pressable
                  onPress={() => {
                    if (!previewPhoto) return;
                    Alert.alert(
                      locale === 'pt-BR' ? 'Excluir foto?' : 'Delete photo?',
                      undefined,
                      [
                        { text: t.common.cancel, style: 'cancel' },
                        {
                          text: t.common.remove,
                          style: 'destructive',
                          onPress: () => deletePhotoMutation.mutate(previewPhoto.id),
                        },
                      ]
                    );
                  }}
                  style={styles.viewerIconBtn}
                >
                  <Trash2 size={18} color={colors.textOnDark} />
                </Pressable>
                <Pressable onPress={() => setPreviewPhoto(null)} style={styles.viewerIconBtn}>
                  <X size={20} color={colors.textOnDark} />
                </Pressable>
              </View>
            </View>
            {previewPhoto ? (
              <Image
                source={{ uri: previewPhoto.viewUrl }}
                style={styles.photoViewerImage}
                contentFit="contain"
              />
            ) : null}
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgCanvas,
  },
  flex: { flex: 1 },
  centerScreen: {
    flex: 1,
    backgroundColor: colors.bgCanvas,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  errorTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  topBar: {
    height: 56,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navIconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTagPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 28,
    gap: 12,
  },
  summaryCard: {
    overflow: 'hidden',
  },
  summaryBody: {
    padding: spacing.lg,
    gap: 12,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderNumberMono: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  applianceTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 18,
    letterSpacing: -0.25,
    color: colors.textPrimary,
  },
  stepperBlock: {
    gap: 6,
  },
  stepperBars: {
    flexDirection: 'row',
    gap: 6,
  },
  stepBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderSubtle,
  },
  stepBarFilled: {
    backgroundColor: colors.brandPrimary,
  },
  stepBarDanger: {
    backgroundColor: colors.danger,
  },
  stepperLabels: {
    flexDirection: 'row',
    gap: 4,
  },
  stepLabel: {
    flex: 1,
    fontFamily: fonts.monoMedium,
    fontSize: 9.5,
    color: colors.textMuted,
    textAlign: 'center',
  },
  stepLabelActive: {
    fontFamily: fonts.monoBold,
    color: colors.brandPrimary,
  },
  customerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F2F5FF',
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  customerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  customerIconBox: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  customerPhone: {
    fontFamily: fonts.monoMedium,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  publicLinkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  publicLinkText: {
    fontFamily: fonts.monoMedium,
    fontSize: 11.5,
    color: colors.brandPrimary,
  },
  diagnosticsCard: {
    gap: 14,
  },
  diagBlock: {
    gap: 5,
  },
  sectionOverline: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    letterSpacing: 0.7,
    color: colors.textMuted,
  },
  diagText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  accessoriesText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12.5,
    color: colors.textSecondary,
    marginTop: 2,
  },
  mutedText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13.5,
    color: colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  sectionHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  inlineEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inlineEditText: {
    fontFamily: fonts.monoMedium,
    fontSize: 11.5,
    color: colors.brandPrimary,
  },
  photosCard: {
    gap: 12,
  },
  cardSectionTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  addPhotoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.brandPrimarySoft,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addPhotoPillText: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.infoDark,
  },
  stageTabs: {
    flexDirection: 'row',
    backgroundColor: '#F2F5FF',
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  stageTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  stageTabActive: {
    backgroundColor: colors.bgSurface,
  },
  stageTabText: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  stageTabTextActive: {
    color: colors.textPrimary,
    fontFamily: fonts.monoBold,
  },
  photoGridRow: {
    gap: 10,
  },
  photoThumb: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.bgSubtle,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  addPhotoTile: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    backgroundColor: '#F2F5FF',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.brandPrimaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addPhotoTileText: {
    fontFamily: fonts.monoMedium,
    fontSize: 10.5,
    color: colors.brandPrimary,
  },
  quoteCard: {
    gap: 12,
  },
  quoteHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  lockText: {
    fontFamily: fonts.monoMedium,
    fontSize: 10.5,
    color: colors.textSecondary,
  },
  reopenLink: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.brandPrimary,
  },
  priceRows: {
    gap: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceLabel: {
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    color: colors.textSecondary,
  },
  priceValue: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  discountValue: {
    color: colors.brandPrimary,
  },
  boldDivider: {
    height: 2,
    backgroundColor: colors.bgSubtle,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  totalAmount: {
    fontFamily: fonts.monoBold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  metaPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F2F5FF',
    borderRadius: radius.md,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  metaPillText: {
    fontFamily: fonts.monoMedium,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  stickyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: spacing.lg,
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  whatsappBarBtn: {
    minWidth: 120,
    minHeight: 52,
  },
  primaryBarBtn: {
    flex: 1,
    width: undefined,
  },
  dualDecisionRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  decisionHalfBtn: {
    flex: 1,
    width: undefined,
    minHeight: 52,
    paddingHorizontal: 10,
  },
  terminalChip: {
    flex: 1,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  terminalText: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  cancelModalCard: {
    gap: 12,
  },
  cancelInput: {
    minHeight: 84,
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: 12,
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },
  cancelActions: {
    flexDirection: 'row',
    gap: 10,
  },
  photoViewerBackdrop: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  photoViewerSafe: {
    flex: 1,
  },
  photoViewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  photoViewerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  viewerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoViewerImage: {
    flex: 1,
    width: '100%',
  },
});
