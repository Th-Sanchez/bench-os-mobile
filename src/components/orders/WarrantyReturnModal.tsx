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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RotateCcw, ShieldCheck, X } from 'lucide-react-native';
import { ordersApi } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { Button } from '@/components/ui/Button';
import { TagBadge } from '@/components/ui/TagBadge';
import { TextField } from '@/components/ui/TextField';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { ServiceOrderItemResponse, ServiceOrderResponse } from '@/types/api';
import { computeWarrantyInfo, formatFullDate } from '@/utils/warrantyReceiptPdf';

interface WarrantyReturnModalProps {
  visible: boolean;
  orderId: string;
  item: ServiceOrderItemResponse | null;
  onClose: () => void;
  onCreated: (createdOrder: ServiceOrderResponse) => void;
}

export function WarrantyReturnModal({
  visible,
  orderId,
  item,
  onClose,
  onCreated,
}: WarrantyReturnModalProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {visible && item ? (
        <WarrantyReturnBody
          key={item.id}
          orderId={orderId}
          item={item}
          onClose={onClose}
          onCreated={onCreated}
        />
      ) : null}
    </Modal>
  );
}

function WarrantyReturnBody({
  orderId,
  item,
  onClose,
  onCreated,
}: {
  orderId: string;
  item: ServiceOrderItemResponse;
  onClose: () => void;
  onCreated: (createdOrder: ServiceOrderResponse) => void;
}) {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardVisible();
  const queryClient = useQueryClient();

  const warranty = computeWarrantyInfo(item);
  const applianceTitle = [item.applianceType, item.brand, item.model].filter(Boolean).join(' ');

  const [reportedIssue, setReportedIssue] = useState('');
  const [accessories, setAccessories] = useState(item.accessories ?? '');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const createReturnMutation = useMutation({
    mutationFn: () =>
      ordersApi.openWarrantyReturn(orderId, item.id, {
        reportedIssue: reportedIssue.trim(),
        accessories: accessories.trim() || undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (createdOrder) => {
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['orders-list'] });
      void queryClient.invalidateQueries({ queryKey: ['bench-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['customer-orders'] });
      onClose();
      onCreated(createdOrder);
    },
    onError: (err) => {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : locale === 'pt-BR'
            ? 'Não foi possível abrir o retorno de garantia.'
            : 'Unable to open warranty return.'
      );
    },
  });

  const handleSubmit = () => {
    setErrorMsg(null);
    if (!reportedIssue.trim()) {
      setErrorMsg(
        locale === 'pt-BR'
          ? 'Descreva o defeito relatado pelo cliente no retorno.'
          : 'Please describe the reported issue for the warranty return.'
      );
      return;
    }
    createReturnMutation.mutate();
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <View
        style={[
          styles.header,
          Platform.OS === 'android' && {
            paddingTop: insets.top,
            height: 58 + insets.top,
          },
        ]}
      >
        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
          <X size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {locale === 'pt-BR' ? 'Retorno em Garantia' : 'Warranty Return'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {/* Reference Appliance Summary */}
        <View style={styles.refCard}>
          <View style={styles.refTopRow}>
            <TagBadge label={`Ref. #${item.tag}`} variant="dark" />
            <TagBadge label={t.voltage[item.voltage]} variant="subtle" />
          </View>
          <Text style={styles.refTitle}>{applianceTitle}</Text>
          {item.technicalDiagnosis ? (
            <Text style={styles.refPrevDiag} numberOfLines={2}>
              {locale === 'pt-BR' ? 'Serviço anterior: ' : 'Previous service: '}
              {item.technicalDiagnosis}
            </Text>
          ) : null}
        </View>

        {/* Warranty Status Banner */}
        <View
          style={[
            styles.statusBanner,
            warranty.hasWarranty && warranty.isActive
              ? styles.statusBannerActive
              : styles.statusBannerWarn,
          ]}
        >
          {warranty.hasWarranty && warranty.isActive ? (
            <ShieldCheck size={18} color={colors.successDark} />
          ) : (
            <AlertTriangle size={18} color={colors.warningDark} />
          )}
          <View style={styles.statusBannerBody}>
            <Text
              style={[
                styles.statusBannerTitle,
                warranty.hasWarranty && warranty.isActive
                  ? styles.statusTitleActive
                  : styles.statusTitleWarn,
              ]}
            >
              {warranty.hasWarranty && warranty.isActive
                ? locale === 'pt-BR'
                  ? `Garantia vigente · ${warranty.daysRemaining} de ${warranty.warrantyDays} dias restantes`
                  : `Active warranty · ${warranty.daysRemaining} of ${warranty.warrantyDays} days left`
                : warranty.hasWarranty && warranty.expiryDate
                  ? locale === 'pt-BR'
                    ? `Garantia expirada em ${formatFullDate(warranty.expiryDate, locale)}`
                    : `Warranty expired on ${formatFullDate(warranty.expiryDate, locale)}`
                  : locale === 'pt-BR'
                    ? 'Entrega anterior sem garantia ativa'
                    : 'Previous delivery had no active warranty'}
            </Text>
            <Text style={styles.statusBannerSub}>
              {locale === 'pt-BR'
                ? 'A nova OS será aberta vinculada a este reparo com valor inicial R$ 0,00 (sem impacto no faturamento se coberto pela garantia).'
                : 'A new linked order will open at R$ 0.00 (zero revenue impact if covered by warranty).'}
            </Text>
          </View>
        </View>

        {errorMsg ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        <TextField
          label={locale === 'pt-BR' ? 'Defeito relatado no retorno *' : 'Reported issue *'}
          placeholder={
            locale === 'pt-BR'
              ? 'Ex: Voltou a apresentar o mesmo sintoma após 2 semanas'
              : 'e.g. Stopped heating again after 2 weeks'
          }
          value={reportedIssue}
          onChangeText={setReportedIssue}
          multiline
          numberOfLines={3}
          style={styles.multilineInput}
        />

        <TextField
          label={locale === 'pt-BR' ? 'Acessórios entregues (opcional)' : 'Accessories (optional)'}
          placeholder={locale === 'pt-BR' ? 'Ex: Prato de vidro, cabo' : 'e.g. Glass plate, power cord'}
          value={accessories}
          onChangeText={setAccessories}
        />

        <TextField
          label={locale === 'pt-BR' ? 'Observações da OS (opcional)' : 'Order notes (optional)'}
          placeholder={locale === 'pt-BR' ? 'Ex: Prioridade na bancada' : 'e.g. Priority on bench'}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={2}
          style={styles.notesInput}
        />
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: isKeyboardVisible ? spacing.md : Math.max(insets.bottom, spacing.lg) },
        ]}
      >
        <Button
          label={locale === 'pt-BR' ? 'Abrir Retorno de Garantia' : 'Open Warranty Return'}
          icon={<RotateCcw size={16} color={colors.textOnDark} />}
          loading={createReturnMutation.isPending}
          onPress={handleSubmit}
        />
      </View>
    </KeyboardAvoidingView>
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
    gap: 14,
  },
  refCard: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.xl,
    padding: 14,
    gap: 6,
  },
  refTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  refTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 15.5,
    color: colors.textPrimary,
  },
  refPrevDiag: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12.5,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 12,
  },
  statusBannerActive: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successBorder,
  },
  statusBannerWarn: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder,
  },
  statusBannerBody: {
    flex: 1,
    gap: 3,
  },
  statusBannerTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
  },
  statusTitleActive: {
    color: colors.successDark,
  },
  statusTitleWarn: {
    color: colors.warningDark,
  },
  statusBannerSub: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
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
  multilineInput: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  notesInput: {
    minHeight: 62,
    textAlignVertical: 'top',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
});
