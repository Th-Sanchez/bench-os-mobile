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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { ordersApi, tenantSettingsApi } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { ServiceOrderItemResponse } from '@/types/api';
import {
  formatCurrencyInput,
  maskCurrencyBRL,
  maskInteger,
  parseCurrencyBRL,
} from '@/utils/masks';

interface QuoteEditModalProps {
  visible: boolean;
  orderId: string;
  item: ServiceOrderItemResponse;
  onClose: () => void;
}

export function QuoteEditModal({ visible, orderId, item, onClose }: QuoteEditModalProps) {
  const settingsQuery = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.get(),
    enabled: visible,
  });

  const defaultLaborCost = Number(settingsQuery.data?.defaultLaborCost ?? 0);
  const initialLabor = item.laborCost > 0 ? item.laborCost : defaultLaborCost;
  const settingsReady = settingsQuery.isSuccess || settingsQuery.isError;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {visible ? (
        <QuoteEditBody
          key={`${item.id}-${item.updatedAt}-${settingsReady ? defaultLaborCost : 'pending'}`}
          orderId={orderId}
          item={item}
          initialLabor={initialLabor}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}

function QuoteEditBody({
  orderId,
  item,
  initialLabor,
  onClose,
}: Omit<QuoteEditModalProps, 'visible'> & { initialLabor: number }) {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardVisible();
  const { locale, formatCurrency } = useI18n();

  const [diagnosis, setDiagnosis] = useState(item.technicalDiagnosis ?? '');
  const [laborInput, setLaborInput] = useState(formatCurrencyInput(initialLabor));
  const [partsInput, setPartsInput] = useState(formatCurrencyInput(item.partsCost));
  const [discountInput, setDiscountInput] = useState(formatCurrencyInput(item.discount));
  const [warrantyInput, setWarrantyInput] = useState(
    item.warrantyDays > 0 ? String(item.warrantyDays) : ''
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const labor = parseCurrencyBRL(laborInput);
  const parts = parseCurrencyBRL(partsInput);
  const discount = parseCurrencyBRL(discountInput);
  const computedTotal = Math.round((labor + parts - discount) * 100) / 100;

  const saveMutation = useMutation({
    mutationFn: () => {
      const warrantyDays = Math.max(0, Number.parseInt(warrantyInput.replace(/\D/g, ''), 10) || 0);
      return ordersApi.updateQuote(orderId, item.id, {
        technicalDiagnosis: diagnosis.trim() || undefined,
        laborCost: labor,
        partsCost: parts,
        discount,
        warrantyDays,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['bench-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['orders-list'] });
      onClose();
    },
    onError: (err) => {
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to update quote');
    },
  });

  const handleSave = () => {
    setErrorMsg(null);
    if (computedTotal < 0) {
      setErrorMsg(
        locale === 'pt-BR'
          ? 'O desconto não pode ser maior que mão de obra + peças.'
          : 'Discount cannot exceed labor + parts cost.'
      );
      return;
    }
    saveMutation.mutate();
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
          {locale === 'pt-BR' ? 'Diagnóstico e Orçamento' : 'Diagnosis & Quote'}
        </Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        {errorMsg ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        <TextField
          label={locale === 'pt-BR' ? 'Diagnóstico técnico' : 'Technical diagnosis'}
          placeholder={
            locale === 'pt-BR'
              ? 'Ex: Magnetron em curto e fusível de alta tensão queimado'
              : 'Describe findings and repair plan...'
          }
          value={diagnosis}
          onChangeText={setDiagnosis}
          multiline
          numberOfLines={4}
          style={styles.textarea}
        />

        <View style={styles.row}>
          <View style={styles.col}>
            <TextField
              label={locale === 'pt-BR' ? 'Mão de obra (R$)' : 'Labor (R$)'}
              placeholder="0,00"
              value={laborInput}
              onChangeText={(val) => setLaborInput(maskCurrencyBRL(val))}
              keyboardType="number-pad"
              mono
            />
          </View>
          <View style={styles.col}>
            <TextField
              label={locale === 'pt-BR' ? 'Peças (R$)' : 'Parts (R$)'}
              placeholder="0,00"
              value={partsInput}
              onChangeText={(val) => setPartsInput(maskCurrencyBRL(val))}
              keyboardType="number-pad"
              mono
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.col}>
            <TextField
              label={locale === 'pt-BR' ? 'Desconto (R$)' : 'Discount (R$)'}
              placeholder="0,00"
              value={discountInput}
              onChangeText={(val) => setDiscountInput(maskCurrencyBRL(val))}
              keyboardType="number-pad"
              mono
            />
          </View>
          <View style={styles.col}>
            <TextField
              label={locale === 'pt-BR' ? 'Garantia (dias)' : 'Warranty (days)'}
              placeholder="90"
              value={warrantyInput}
              onChangeText={(val) => setWarrantyInput(maskInteger(val, 4))}
              keyboardType="number-pad"
              maxLength={4}
              mono
            />
          </View>
        </View>

        <View style={[styles.totalBox, computedTotal < 0 && styles.totalBoxError]}>
          <Text style={styles.totalLabel}>
            {locale === 'pt-BR' ? 'Total calculado' : 'Calculated total'}
          </Text>
          <Text style={[styles.totalValue, computedTotal < 0 && styles.totalValueError]}>
            {formatCurrency(computedTotal)}
          </Text>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: isKeyboardVisible ? spacing.md : Math.max(insets.bottom, spacing.lg) },
        ]}
      >
          <Button
            label={locale === 'pt-BR' ? 'Salvar orçamento' : 'Save quote'}
            onPress={handleSave}
            loading={saveMutation.isPending}
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  spacer: { width: 36 },
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
  textarea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  col: {
    flex: 1,
  },
  totalBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    borderRadius: radius.lg,
    padding: 16,
  },
  totalBoxError: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  totalLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  totalValue: {
    fontFamily: fonts.monoBold,
    fontSize: 20,
    color: colors.brandPrimary,
  },
  totalValueError: {
    color: colors.danger,
  },
  footer: {
    padding: spacing.lg,
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
});
