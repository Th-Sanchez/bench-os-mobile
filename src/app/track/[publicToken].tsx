import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Package,
  RefreshCw,
  Share2,
  ShieldCheck,
  Store,
  Wrench,
  X,
} from 'lucide-react-native';
import { publicOrderApi } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type {
  ItemStatus,
  PublicOrderItemPhotoResponse,
  PublicOrderItemResponse,
} from '@/types/api';

interface ProgressVisual {
  stepIndex: number; // 0..4 for active bar fill
  isWarning: boolean;
  isTerminalAlert: boolean;
  thirdStepLabel: string;
  helperText: string;
}

function getProgressVisual(status: ItemStatus, locale: 'pt-BR' | 'en'): ProgressVisual {
  const isPt = locale === 'pt-BR';

  switch (status) {
    case 'RECEIVED':
      return {
        stepIndex: 0,
        isWarning: false,
        isTerminalAlert: false,
        thirdStepLabel: isPt ? 'Aprovado' : 'Approved',
        helperText: isPt
          ? 'Etapa 1 de 5: aparelho recebido e aguardando triagem na bancada'
          : 'Step 1 of 5: appliance received and queued for bench triage',
      };
    case 'DIAGNOSING':
      return {
        stepIndex: 1,
        isWarning: false,
        isTerminalAlert: false,
        thirdStepLabel: isPt ? 'Aprovado' : 'Approved',
        helperText: isPt
          ? 'Etapa 2 de 5: técnico realizando diagnóstico na bancada'
          : 'Step 2 of 5: technician running diagnostics on the bench',
      };
    case 'QUOTE_SENT':
      return {
        stepIndex: 2,
        isWarning: true,
        isTerminalAlert: false,
        thirdStepLabel: isPt ? 'Orçamento' : 'Quote',
        helperText: isPt
          ? 'Etapa 3 de 5: orçamento enviado, aguardando sua aprovação'
          : 'Step 3 of 5: quote sent, awaiting your approval',
      };
    case 'APPROVED':
      return {
        stepIndex: 2,
        isWarning: false,
        isTerminalAlert: false,
        thirdStepLabel: isPt ? 'Aprovado' : 'Approved',
        helperText: isPt
          ? 'Etapa 3 de 5: orçamento aprovado, preparando início do reparo'
          : 'Step 3 of 5: quote approved, preparing repair',
      };
    case 'WAITING_PARTS':
      return {
        stepIndex: 2,
        isWarning: true,
        isTerminalAlert: false,
        thirdStepLabel: isPt ? 'Peça' : 'Parts',
        helperText: isPt
          ? 'Etapa 3 de 5: aguardando chegada de componente para reposição'
          : 'Step 3 of 5: waiting for replacement component delivery',
      };
    case 'IN_REPAIR':
      return {
        stepIndex: 3,
        isWarning: false,
        isTerminalAlert: false,
        thirdStepLabel: isPt ? 'Aprovado' : 'Approved',
        helperText: isPt
          ? 'Etapa 4 de 5: equipamento em reparo e testes na bancada'
          : 'Step 4 of 5: appliance undergoing repair and bench testing',
      };
    case 'READY_FOR_PICKUP':
      return {
        stepIndex: 4,
        isWarning: false,
        isTerminalAlert: false,
        thirdStepLabel: isPt ? 'Aprovado' : 'Approved',
        helperText: isPt
          ? 'Equipamento finalizado, testado e pronto para retirada no balcão'
          : 'Repair completed, tested, and ready for pickup at the counter',
      };
    case 'DELIVERED':
      return {
        stepIndex: 4,
        isWarning: false,
        isTerminalAlert: false,
        thirdStepLabel: isPt ? 'Aprovado' : 'Approved',
        helperText: isPt
          ? 'Aparelho entregue ao cliente com sucesso'
          : 'Appliance successfully delivered to the customer',
      };
    case 'REJECTED':
      return {
        stepIndex: 2,
        isWarning: true,
        isTerminalAlert: true,
        thirdStepLabel: isPt ? 'Recusado' : 'Rejected',
        helperText: isPt
          ? 'Orçamento não aprovado — aparelho disponível para devolução sem custo'
          : 'Quote declined — appliance available for zero-charge return',
      };
    case 'DISCARDED':
      return {
        stepIndex: 4,
        isWarning: true,
        isTerminalAlert: true,
        thirdStepLabel: isPt ? 'Encerrado' : 'Closed',
        helperText: isPt
          ? 'Ordem encerrada por descarte após prazo legal de abandono'
          : 'Order closed as discarded after abandonment holding period',
      };
    case 'CANCELLED':
      return {
        stepIndex: 0,
        isWarning: true,
        isTerminalAlert: true,
        thirdStepLabel: isPt ? 'Cancelado' : 'Cancelled',
        helperText: isPt
          ? 'Atendimento cancelado na oficina'
          : 'Service order item was cancelled',
      };
  }
}

function formatApplianceName(item: PublicOrderItemResponse): string {
  return [item.applianceType, item.brand, item.model]
    .filter((part): part is string => Boolean(part && part.trim().length > 0))
    .join(' ');
}

function formatUpdatedClock(timestampMs: number): string {
  const date = new Date(timestampMs || Date.now());
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function PublicTrackScreen() {
  const router = useRouter();
  const { publicToken } = useLocalSearchParams<{ publicToken: string }>();
  const { locale, t, formatCurrency, formatShortDate } = useI18n();

  const [zoomedPhoto, setZoomedPhoto] = useState<PublicOrderItemPhotoResponse | null>(null);

  const token = typeof publicToken === 'string' ? publicToken.trim() : '';

  const orderQuery = useQuery({
    queryKey: ['public-order', token],
    queryFn: () => publicOrderApi.getByToken(token),
    enabled: token.length > 0,
    retry: 1,
  });

  const canGoBack = router.canGoBack();
  const order = orderQuery.data;

  const updatedClock = useMemo(
    () => formatUpdatedClock(orderQuery.dataUpdatedAt),
    [orderQuery.dataUpdatedAt]
  );

  const handleShare = async () => {
    if (!order) return;
    const message =
      locale === 'pt-BR'
        ? `Acompanhamento da OS #${order.orderNumber} (${order.shopName}) — Código: ${token}`
        : `Track Order #${order.orderNumber} (${order.shopName}) — Token: ${token}`;
    try {
      await Share.share({ message });
    } catch {
      // User dismissed share sheet
    }
  };

  const renderItemCard = (item: PublicOrderItemResponse) => {
    const progress = getProgressVisual(item.status, locale);
    const steps = [
      locale === 'pt-BR' ? 'Recebido' : 'Received',
      locale === 'pt-BR' ? 'Diagnóstico' : 'Diagnosis',
      progress.thirdStepLabel,
      locale === 'pt-BR' ? 'Conserto' : 'Repair',
      locale === 'pt-BR' ? 'Pronto' : 'Ready',
    ];

    const isWaitingParts = item.status === 'WAITING_PARTS';
    const isFinished = item.status === 'READY_FOR_PICKUP' || item.status === 'DELIVERED';

    return (
      <View key={item.tag} style={styles.itemCard}>
        {/* Tag & Status */}
        <View style={styles.itemTopRow}>
          <View style={styles.tagPill}>
            <Text style={styles.tagPillText}>#{item.tag}</Text>
          </View>
          <StatusBadge status={item.status} />
        </View>

        {/* Appliance Title */}
        <View style={styles.titleBlock}>
          <Text style={styles.applianceTitle}>{formatApplianceName(item)}</Text>
          {order ? (
            <Text style={styles.entrySubtitle}>
              {locale === 'pt-BR'
                ? `Entrada registrada em ${formatShortDate(order.createdAt)} · Item ${item.itemIndex}`
                : `Checked in on ${formatShortDate(order.createdAt)} · Item ${item.itemIndex}`}
            </Text>
          ) : null}
        </View>

        {/* 5-Step Progress Bar */}
        <View style={styles.stepperBlock}>
          <View style={styles.stepLabelsRow}>
            {steps.map((label, idx) => {
              const reached = idx <= progress.stepIndex;
              const isCurrentWarning = idx === progress.stepIndex && progress.isWarning;
              return (
                <Text
                  key={`${item.tag}-${label}`}
                  style={[
                    styles.stepLabel,
                    reached && styles.stepLabelReached,
                    isCurrentWarning && styles.stepLabelWarning,
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              );
            })}
          </View>

          <View style={styles.stepBarsRow}>
            {steps.map((label, idx) => {
              const reached = idx <= progress.stepIndex;
              const isCurrentWarning = idx === progress.stepIndex && progress.isWarning;
              const isAlert = progress.isTerminalAlert && idx === progress.stepIndex;

              return (
                <View
                  key={`${item.tag}-bar-${label}`}
                  style={[
                    styles.stepBarSegment,
                    reached && styles.stepBarReached,
                    isCurrentWarning && styles.stepBarWarning,
                    isAlert && styles.stepBarDanger,
                  ]}
                />
              );
            })}
          </View>

          <View style={styles.helperRow}>
            {progress.isTerminalAlert ? (
              <AlertCircle size={14} color={colors.danger} />
            ) : isFinished ? (
              <CheckCircle2 size={14} color={colors.brandPrimary} />
            ) : isWaitingParts ? (
              <Package size={14} color={colors.warning} />
            ) : item.status === 'IN_REPAIR' ? (
              <Wrench size={14} color={colors.brandPrimary} />
            ) : (
              <Clock size={14} color={colors.textSecondary} />
            )}
            <Text style={styles.helperText}>{progress.helperText}</Text>
          </View>
        </View>

        {/* Technical Diagnosis Box */}
        {item.technicalDiagnosis ? (
          <View
            style={[
              styles.diagnosisBox,
              isWaitingParts && styles.diagnosisBoxWarning,
            ]}
          >
            <Text
              style={[
                styles.diagnosisOverline,
                isWaitingParts && styles.diagnosisOverlineWarning,
              ]}
            >
              {isWaitingParts
                ? locale === 'pt-BR'
                  ? 'STATUS DE SUPRIMENTO / DIAGNÓSTICO:'
                  : 'PARTS & DIAGNOSIS STATUS:'
                : locale === 'pt-BR'
                  ? 'DIAGNÓSTICO REALIZADO:'
                  : 'TECHNICAL DIAGNOSIS:'}
            </Text>
            <Text style={styles.diagnosisBody}>{item.technicalDiagnosis}</Text>
          </View>
        ) : null}

        {/* Photos Gallery (Signed R2 URLs) */}
        {item.photos.length > 0 ? (
          <View style={styles.photosSection}>
            <View style={styles.photosHeader}>
              <Text style={styles.photosOverline}>
                {locale === 'pt-BR'
                  ? `FOTOS DO ATENDIMENTO (${item.photos.length})`
                  : `SERVICE PHOTOS (${item.photos.length})`}
              </Text>
              <Text style={styles.photosHint}>
                {locale === 'pt-BR' ? 'Toque para ampliar' : 'Tap to zoom'}
              </Text>
            </View>

            <View style={styles.photosGrid}>
              {item.photos.map((photo) => (
                <Pressable
                  key={photo.id}
                  onPress={() => setZoomedPhoto(photo)}
                  style={styles.photoCard}
                >
                  <Image
                    source={{ uri: photo.viewUrl }}
                    style={styles.photoImage}
                    resizeMode="cover"
                  />
                  <View style={styles.photoStagePill}>
                    <Text style={styles.photoStageText}>{t.photoStage[photo.stage]}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* Footer: Price & Warranty or Estimated Completion */}
        {item.totalPrice > 0 ? (
          <View style={styles.itemFooterRow}>
            <View>
              <Text style={styles.priceLabel}>
                {locale === 'pt-BR' ? 'Valor do conserto' : 'Repair total'}
              </Text>
              <Text style={styles.priceValue}>{formatCurrency(item.totalPrice)}</Text>
            </View>
            {item.warrantyDays > 0 ? (
              <View style={styles.warrantyPill}>
                <ShieldCheck size={14} color={colors.infoDark} strokeWidth={2.2} />
                <Text style={styles.warrantyText}>
                  {locale === 'pt-BR'
                    ? `Garantia: ${item.warrantyDays} dias`
                    : `Warranty: ${item.warrantyDays} days`}
                </Text>
              </View>
            ) : null}
          </View>
        ) : item.estimatedCompletionDate ? (
          <View style={styles.etaRow}>
            <Text style={styles.etaLabel}>
              {locale === 'pt-BR' ? 'Previsão de conclusão: ' : 'Estimated completion: '}
              <Text style={styles.etaDate}>
                {formatShortDate(item.estimatedCompletionDate)}
              </Text>
            </Text>
            <Text style={styles.etaStatus}>
              {locale === 'pt-BR' ? 'Em andamento' : 'In progress'}
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          {canGoBack ? (
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={styles.backBtn}
              accessibilityLabel={t.common.back}
            >
              <ArrowLeft size={20} color={colors.textPrimary} />
            </Pressable>
          ) : null}
          <View style={styles.brandIconBox}>
            <Wrench size={18} color={colors.textOnDark} strokeWidth={2.2} />
          </View>
          <View style={styles.brandTextCol}>
            <Text style={styles.shopTitle} numberOfLines={1}>
              {order?.shopName || 'BenchOS'}
            </Text>
            <Text style={styles.shopSubtitle} numberOfLines={1}>
              {locale === 'pt-BR' ? 'Acompanhamento de reparo' : 'Repair status tracker'}
            </Text>
          </View>
        </View>

        {order ? (
          <View style={styles.osNumberPill}>
            <Text style={styles.osNumberText}>OS #{order.orderNumber}</Text>
          </View>
        ) : null}
      </View>

      {orderQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
          <Text style={styles.stateSubtext}>
            {locale === 'pt-BR'
              ? 'Consultando status da sua ordem de serviço...'
              : 'Loading your service order status...'}
          </Text>
        </View>
      ) : orderQuery.isError || !order ? (
        <View style={styles.centerState}>
          <View style={styles.errorIconCircle}>
            <AlertCircle size={24} color={colors.danger} />
          </View>
          <Text style={styles.stateTitle}>
            {locale === 'pt-BR' ? 'Ordem não encontrada' : 'Order not found'}
          </Text>
          <Text style={styles.stateSubtext}>
            {locale === 'pt-BR'
              ? 'O link de acompanhamento é inválido ou não está mais disponível.'
              : 'This tracking link is invalid or no longer available.'}
          </Text>
          <View style={styles.stateActions}>
            <Button
              label={t.common.retry}
              variant="secondary"
              fullWidth={false}
              onPress={() => {
                void orderQuery.refetch();
              }}
            />
          </View>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={orderQuery.isRefetching}
              onRefresh={() => {
                void orderQuery.refetch();
              }}
              tintColor={colors.brandPrimary}
              colors={[colors.brandPrimary]}
            />
          }
        >
          {/* Official Tracking Welcome Banner */}
          <View style={styles.welcomeBanner}>
            <View style={styles.welcomeIconCircle}>
              <BadgeCheck size={18} color={colors.brandPrimary} strokeWidth={2.2} />
            </View>
            <View style={styles.welcomeCopy}>
              <Text style={styles.welcomeTitle}>
                {locale === 'pt-BR'
                  ? 'Página oficial de acompanhamento'
                  : 'Official repair tracking page'}
              </Text>
              <Text style={styles.welcomeText}>
                {locale === 'pt-BR'
                  ? 'Olá! Acompanhe aqui o andamento dos seus aparelhos em tempo real com transparência e segurança técnica.'
                  : 'Track your appliances in real time with full technical transparency.'}
              </Text>
            </View>
          </View>

          {/* Appliance Cards */}
          {order.items.map(renderItemCard)}

          {/* Pickup Guidance Card */}
          <View style={styles.pickupCard}>
            <View style={styles.pickupHeader}>
              <Store size={16} color={colors.brandPrimary} strokeWidth={2.2} />
              <Text style={styles.pickupTitle}>
                {locale === 'pt-BR' ? 'Instruções de Retirada' : 'Pickup Instructions'}
              </Text>
            </View>
            <Text style={styles.pickupBody}>
              {locale === 'pt-BR' ? (
                <>
                  Quando o status estiver como{' '}
                  <Text style={styles.pickupBold}>Pronto p/ Retirada</Text>, apresente o
                  número da ordem <Text style={styles.pickupMono}>#{order.orderNumber}</Text>{' '}
                  no balcão da oficina {order.shopName}.
                </>
              ) : (
                <>
                  Once the status shows{' '}
                  <Text style={styles.pickupBold}>Ready for Pickup</Text>, present order{' '}
                  <Text style={styles.pickupMono}>#{order.orderNumber}</Text> at{' '}
                  {order.shopName}.
                </>
              )}
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.bottomActions}>
            <Button
              label={locale === 'pt-BR' ? 'Atualizar acompanhamento' : 'Refresh status'}
              icon={<RefreshCw size={16} color={colors.textOnDark} strokeWidth={2.2} />}
              loading={orderQuery.isRefetching}
              onPress={() => {
                void orderQuery.refetch();
              }}
            />
            <Button
              label={locale === 'pt-BR' ? 'Compartilhar código da OS' : 'Share order tracking'}
              variant="secondary"
              icon={<Share2 size={16} color={colors.textPrimary} strokeWidth={2} />}
              onPress={() => {
                void handleShare();
              }}
            />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerClock}>
              {locale === 'pt-BR'
                ? `BenchOS · Atualizado às ${updatedClock}`
                : `BenchOS · Updated at ${updatedClock}`}
            </Text>
            <Text style={styles.footerNote}>
              {locale === 'pt-BR'
                ? `Ambiente seguro para cliente final · OS #${order.orderNumber}`
                : `Secure customer tracking view · Order #${order.orderNumber}`}
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Photo Zoom Modal */}
      <Modal
        visible={zoomedPhoto !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setZoomedPhoto(null)}
      >
        <View style={styles.zoomBackdrop}>
          <Pressable
            onPress={() => setZoomedPhoto(null)}
            style={styles.zoomCloseBtn}
            hitSlop={12}
          >
            <X size={24} color={colors.textOnDark} />
          </Pressable>
          {zoomedPhoto ? (
            <>
              <Image
                source={{ uri: zoomedPhoto.viewUrl }}
                style={styles.zoomImage}
                resizeMode="contain"
              />
              <View style={styles.zoomCaptionPill}>
                <Text style={styles.zoomCaptionText}>
                  {t.photoStage[zoomedPhoto.stage]} · {formatShortDate(zoomedPhoto.createdAt)}
                </Text>
              </View>
            </>
          ) : null}
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSubtle,
  },
  brandIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTextCol: {
    flex: 1,
    minWidth: 0,
  },
  shopTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  shopSubtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  osNumberPill: {
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  osNumberText: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    color: colors.infoDark,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 32,
    gap: 14,
  },
  welcomeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    borderRadius: radius.lg,
    padding: 14,
  },
  welcomeIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeCopy: {
    flex: 1,
    gap: 3,
  },
  welcomeTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  welcomeText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  itemCard: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: 16,
    gap: 14,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tagPill: {
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagPillText: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    color: colors.textSecondary,
  },
  titleBlock: {
    gap: 2,
  },
  applianceTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  entrySubtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  stepperBlock: {
    gap: 8,
  },
  stepLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  stepLabel: {
    flex: 1,
    fontFamily: fonts.monoMedium,
    fontSize: 9,
    color: colors.textMuted,
    textAlign: 'center',
  },
  stepLabelReached: {
    fontFamily: fonts.monoBold,
    color: colors.brandPrimary,
  },
  stepLabelWarning: {
    fontFamily: fonts.monoBold,
    color: colors.warningDark,
  },
  stepBarsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  stepBarSegment: {
    flex: 1,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.bgSubtle,
  },
  stepBarReached: {
    backgroundColor: colors.brandPrimary,
  },
  stepBarWarning: {
    backgroundColor: colors.warning,
  },
  stepBarDanger: {
    backgroundColor: colors.danger,
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  helperText: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  diagnosisBox: {
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: 12,
    gap: 4,
  },
  diagnosisBoxWarning: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder,
  },
  diagnosisOverline: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
  diagnosisOverlineWarning: {
    color: colors.warningDark,
  },
  diagnosisBody: {
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  photosSection: {
    gap: 8,
  },
  photosHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  photosOverline: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.textSecondary,
  },
  photosHint: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: colors.textMuted,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoCard: {
    width: '48.5%',
    height: 120,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.bgSubtle,
    position: 'relative',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoStagePill: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  photoStageText: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: colors.textOnDark,
  },
  itemFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.bgSubtle,
    paddingTop: 12,
  },
  priceLabel: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  priceValue: {
    fontFamily: fonts.monoBold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  warrantyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  warrantyText: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    color: colors.infoDark,
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.bgSubtle,
    paddingTop: 10,
  },
  etaLabel: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  etaDate: {
    fontFamily: fonts.monoBold,
    color: colors.textPrimary,
  },
  etaStatus: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    color: colors.warningDark,
  },
  pickupCard: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: 14,
    gap: 6,
  },
  pickupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickupTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  pickupBody: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  pickupBold: {
    fontFamily: fonts.bodySemiBold,
    color: colors.textPrimary,
  },
  pickupMono: {
    fontFamily: fonts.monoBold,
    color: colors.textPrimary,
  },
  bottomActions: {
    gap: 10,
    marginTop: 2,
  },
  footer: {
    alignItems: 'center',
    gap: 3,
    paddingTop: 4,
  },
  footerClock: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: colors.textSecondary,
  },
  footerNote: {
    fontFamily: fonts.bodyRegular,
    fontSize: 11,
    color: colors.textMuted,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: 10,
  },
  errorIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stateTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 17,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  stateSubtext: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  stateActions: {
    marginTop: 6,
  },
  zoomBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  zoomCloseBtn: {
    position: 'absolute',
    top: 52,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  zoomImage: {
    width: '100%',
    height: '75%',
  },
  zoomCaptionPill: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  zoomCaptionText: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.textOnDark,
  },
});
