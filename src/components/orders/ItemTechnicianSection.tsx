import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, User, Wrench, X } from 'lucide-react-native';
import { ordersApi, tenantSettingsApi, usersApi } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { useAuth } from '@/auth/AuthProvider';
import { Card } from '@/components/ui/Card';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { ServiceOrderItemResponse } from '@/types/api';

interface ItemTechnicianSectionProps {
  orderId: string;
  item: ServiceOrderItemResponse;
}

export function ItemTechnicianSection({ orderId, item }: ItemTechnicianSectionProps) {
  const { locale, t, formatCurrency } = useI18n();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [pickerOpen, setPickerOpen] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.get(),
  });

  const visible =
    Boolean(settingsQuery.data?.technicianAssignmentEnabled) ||
    Boolean(item.assignedTechnicianId);

  const techniciansQuery = useQuery({
    queryKey: ['assignable-technicians'],
    queryFn: () => usersApi.listTechnicians(),
    enabled: visible,
  });

  const assignMutation = useMutation({
    mutationFn: (technicianId: string | null) =>
      ordersApi.assignTechnician(orderId, item.id, { technicianId }),
    onSuccess: async () => {
      setPickerOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['order', orderId] }),
        queryClient.invalidateQueries({ queryKey: ['bench-queue'] }),
      ]);
    },
    onError: (err) => {
      Alert.alert(
        locale === 'pt-BR' ? 'Erro' : 'Error',
        err instanceof ApiError ? err.message : t.common.errorGeneric
      );
    },
  });

  if (!visible) {
    return null;
  }

  const isTerminal =
    item.status === 'DELIVERED' || item.status === 'DISCARDED' || item.status === 'CANCELLED';
  const isOwner = session?.user.role === 'OWNER';

  return (
    <>
      <Card style={styles.card}>
        <Pressable
          disabled={isTerminal}
          onPress={() => setPickerOpen(true)}
          style={styles.row}
        >
          <View style={styles.left}>
            <View style={styles.iconBox}>
              <Wrench size={15} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.overline}>
                {locale === 'pt-BR' ? 'TÉCNICO RESPONSÁVEL' : 'RESPONSIBLE TECHNICIAN'}
              </Text>
              <Text style={styles.techName}>
                {item.assignedTechnicianName ||
                  (locale === 'pt-BR' ? 'Não atribuído' : 'Unassigned')}
              </Text>
              {isOwner && item.status === 'DELIVERED' && item.commissionAmount != null ? (
                <Text style={styles.commissionHint}>
                  {locale === 'pt-BR' ? 'Comissão:' : 'Commission:'}{' '}
                  {formatCurrency(item.commissionAmount)}
                  {item.commissionPercent != null ? ` (${item.commissionPercent.toFixed(1)}%)` : ''}
                </Text>
              ) : null}
            </View>
          </View>
          {!isTerminal ? <ChevronRight size={16} color={colors.textMuted} /> : null}
        </Pressable>
      </Card>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPickerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={locale === 'pt-BR' ? 'Fechar' : 'Close'}
          />
          <View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom + spacing.md, spacing.xl) },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {locale === 'pt-BR' ? 'Escolher Técnico' : 'Assign Technician'}
              </Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={8}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.sheetBody}>
              <Pressable
                onPress={() => assignMutation.mutate(null)}
                style={[
                  styles.optionRow,
                  !item.assignedTechnicianId && styles.optionRowActive,
                ]}
              >
                <View style={styles.optionLeft}>
                  <User size={16} color={colors.textMuted} />
                  <Text style={styles.optionText}>
                    {locale === 'pt-BR' ? 'Sem técnico atribuído' : 'Unassigned'}
                  </Text>
                </View>
                {!item.assignedTechnicianId ? (
                  <Check size={16} color={colors.brandPrimary} />
                ) : null}
              </Pressable>

              {(techniciansQuery.data ?? []).map((tech) => {
                const selected = item.assignedTechnicianId === tech.id;
                return (
                  <Pressable
                    key={tech.id}
                    onPress={() => assignMutation.mutate(tech.id)}
                    style={[styles.optionRow, selected && styles.optionRowActive]}
                  >
                    <View style={styles.optionLeft}>
                      <Wrench
                        size={16}
                        color={selected ? colors.brandPrimary : colors.textSecondary}
                      />
                      <Text
                        style={[styles.optionText, selected && styles.optionTextActive]}
                      >
                        {tech.name}
                      </Text>
                    </View>
                    {selected ? <Check size={16} color={colors.brandPrimary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overline: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
  techName: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.textPrimary,
    marginTop: 1,
  },
  commissionHint: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: colors.successDark,
    marginTop: 2,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bgSurface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '70%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  sheetTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  sheetBody: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgCanvas,
  },
  optionRowActive: {
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandPrimarySoft,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  optionText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  optionTextActive: {
    color: colors.brandPrimary,
  },
});
