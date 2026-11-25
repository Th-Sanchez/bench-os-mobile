import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import {
  CheckCircle2,
  ClipboardCheck,
  FileText,
  MessageCircle,
  X,
} from 'lucide-react-native';
import { ordersApi } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { ItemStatus, WhatsappMessageStage } from '@/types/api';

interface WhatsappStageModalProps {
  visible: boolean;
  orderId: string;
  orderNumber?: number;
  itemCount?: number;
  suggestedStage?: WhatsappMessageStage;
  onClose: () => void;
}

export function inferWhatsappStageFromStatuses(statuses: ItemStatus[]): WhatsappMessageStage {
  const anyReady = statuses.includes('READY_FOR_PICKUP');
  const anyQuote = statuses.includes('QUOTE_SENT');
  if (anyReady && !anyQuote) return 'READY';
  if (anyQuote || statuses.includes('DIAGNOSING')) return 'QUOTE';
  return 'INTAKE';
}

export function WhatsappStageModal({
  visible,
  orderId,
  orderNumber,
  itemCount,
  suggestedStage = 'QUOTE',
  onClose,
}: WhatsappStageModalProps) {
  const insets = useSafeAreaInsets();
  const { locale, t } = useI18n();

  const sendMutation = useMutation({
    mutationFn: (stage: WhatsappMessageStage) =>
      ordersApi.getOrderWhatsappLink(orderId, stage),
    onSuccess: (res) => {
      onClose();
      void Linking.openURL(res.whatsappUrl);
    },
    onError: (err) => {
      Alert.alert('WhatsApp', err instanceof ApiError ? err.message : t.common.errorGeneric);
    },
  });

  const options: {
    stage: WhatsappMessageStage;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
  }[] = [
    {
      stage: 'INTAKE',
      title: locale === 'pt-BR' ? 'Entrada da OS' : 'Order Intake',
      subtitle:
        locale === 'pt-BR'
          ? 'Comprovante com todos os aparelhos e link de acompanhamento'
          : 'Receipt listing all appliances and public tracking link',
      icon: <ClipboardCheck size={18} color={colors.brandPrimary} />,
    },
    {
      stage: 'QUOTE',
      title: locale === 'pt-BR' ? 'Orçamento da OS' : 'Order Quote',
      subtitle:
        locale === 'pt-BR'
          ? 'Valores de todos os aparelhos + link para aprovação online'
          : 'Prices for all appliances + online approval link',
      icon: <FileText size={18} color={colors.warning} />,
    },
    {
      stage: 'READY',
      title: locale === 'pt-BR' ? 'Pronto p/ Retirada' : 'Ready for Pickup',
      subtitle:
        locale === 'pt-BR'
          ? 'Aviso de conclusão com resumo dos aparelhos e total'
          : 'Completion notice with summary and total price',
      icon: <CheckCircle2 size={18} color={colors.success} />,
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={locale === 'pt-BR' ? 'Fechar' : 'Close'}
        />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <MessageCircle size={19} color={colors.successDark} />
              <Text style={styles.title}>
                {locale === 'pt-BR'
                  ? `Enviar WhatsApp${orderNumber ? ` · OS #${orderNumber}` : ''}`
                  : `Send WhatsApp${orderNumber ? ` · Order #${orderNumber}` : ''}`}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            {locale === 'pt-BR'
              ? `A mensagem inclui todos os aparelhos da OS${
                  itemCount && itemCount > 1 ? ` (${itemCount} itens)` : ''
                } em um único envio.`
              : `The message consolidates all appliances in this order${
                  itemCount && itemCount > 1 ? ` (${itemCount} items)` : ''
                }.`}
          </Text>

          <View style={styles.optionsList}>
            {options.map((opt) => {
              const recommended = opt.stage === suggestedStage;
              const isLoading = sendMutation.isPending && sendMutation.variables === opt.stage;
              return (
                <Pressable
                  key={opt.stage}
                  disabled={sendMutation.isPending}
                  onPress={() => sendMutation.mutate(opt.stage)}
                  style={({ pressed }) => [
                    styles.optionCard,
                    recommended && styles.optionCardRecommended,
                    pressed && styles.optionCardPressed,
                  ]}
                >
                  <View style={styles.optionIcon}>{opt.icon}</View>
                  <View style={styles.optionCopy}>
                    <View style={styles.optionTitleRow}>
                      <Text style={styles.optionTitle}>{opt.title}</Text>
                      {recommended ? (
                        <View style={styles.recommendedPill}>
                          <Text style={styles.recommendedText}>
                            {locale === 'pt-BR' ? 'Sugerido' : 'Suggested'}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.optionSubtitle}>{opt.subtitle}</Text>
                  </View>
                  {isLoading ? (
                    <ActivityIndicator size="small" color={colors.brandPrimary} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  subtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12.5,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  optionsList: {
    gap: 10,
    marginTop: 2,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: 13,
  },
  optionCardRecommended: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successBorder,
  },
  optionCardPressed: {
    opacity: 0.85,
  },
  optionIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCopy: {
    flex: 1,
    gap: 2,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  optionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  recommendedPill: {
    backgroundColor: colors.success,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  recommendedText: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
    color: colors.textOnDark,
  },
  optionSubtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
