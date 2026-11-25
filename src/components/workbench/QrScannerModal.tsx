import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import {
  AlertCircle,
  Camera,
  ChevronRight,
  Flashlight,
  FlashlightOff,
  QrCode,
  RefreshCw,
  X,
} from 'lucide-react-native';
import { ordersApi } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TagBadge } from '@/components/ui/TagBadge';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { ServiceOrderResponse } from '@/types/api';
import { parseBenchQrPayload } from '@/utils/labelPrintPdf';

interface QrScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onOpenItem: (orderId: string, itemId: string) => void;
}

export function QrScannerModal({ visible, onClose, onOpenItem }: QrScannerModalProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {visible ? <QrScannerBody onClose={onClose} onOpenItem={onOpenItem} /> : null}
    </Modal>
  );
}

function QrScannerBody({
  onClose,
  onOpenItem,
}: {
  onClose: () => void;
  onOpenItem: (orderId: string, itemId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { locale, t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();

  const [torchOn, setTorchOn] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [multiItemOrder, setMultiItemOrder] = useState<ServiceOrderResponse | null>(null);

  const scanLockRef = useRef(false);

  const resetScanner = () => {
    scanLockRef.current = false;
    setErrorMessage(null);
    setMultiItemOrder(null);
    setResolving(false);
  };

  const handleBarcodeScanned = async (result: BarcodeScanningResult) => {
    if (scanLockRef.current || resolving || multiItemOrder) return;

    const parsed = parseBenchQrPayload(result.data ?? '');
    if (!parsed) {
      scanLockRef.current = true;
      setErrorMessage(
        locale === 'pt-BR'
          ? 'QR Code não reconhecido como uma etiqueta do BenchOS.'
          : 'This QR code is not a recognized BenchOS label.'
      );
      return;
    }

    scanLockRef.current = true;
    setResolving(true);
    setErrorMessage(null);

    try {
      const order = await ordersApi.getByToken(parsed.publicToken);
      if (order.items.length === 0) {
        setErrorMessage(
          locale === 'pt-BR'
            ? `OS #${order.orderNumber} não possui aparelhos cadastrados.`
            : `Order #${order.orderNumber} has no items.`
        );
        return;
      }

      if (parsed.itemIndex !== undefined) {
        const matched = order.items.find((item) => item.itemIndex === parsed.itemIndex);
        if (matched) {
          onClose();
          onOpenItem(order.id, matched.id);
          return;
        }
      }

      if (order.items.length === 1) {
        onClose();
        onOpenItem(order.id, order.items[0].id);
        return;
      }

      // Order QR without a specific item index and multiple appliances -> let technician pick
      setMultiItemOrder(order);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setErrorMessage(
          locale === 'pt-BR'
            ? 'Esta etiqueta não foi encontrada na sua oficina.'
            : 'This label was not found in your workshop.'
        );
      } else {
        setErrorMessage(err instanceof Error ? err.message : t.common.errorGeneric);
      }
    } finally {
      setResolving(false);
    }
  };

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.fallbackScreen, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.fallbackTopBar}>
          <Text style={styles.fallbackTitle}>
            {locale === 'pt-BR' ? 'Leitor de QR Code' : 'QR Code Scanner'}
          </Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <X size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.fallbackCenter}>
          <View style={styles.fallbackIcon}>
            <QrCode size={28} color={colors.brandPrimary} />
          </View>
          <Text style={styles.fallbackHeading}>
            {locale === 'pt-BR' ? 'Disponível no app do celular' : 'Available on the mobile app'}
          </Text>
          <Text style={styles.fallbackSub}>
            {locale === 'pt-BR'
              ? 'Use o BenchOS no celular Android ou iPhone para escanear etiquetas de aparelhos com a câmera.'
              : 'Use the BenchOS mobile app on Android or iOS to scan appliance labels with the camera.'}
          </Text>
          <Button
            label={locale === 'pt-BR' ? 'Fechar' : 'Close'}
            variant="secondary"
            fullWidth={false}
            onPress={onClose}
          />
        </View>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={styles.darkCenter}>
        <ActivityIndicator size="large" color={colors.textOnDark} />
      </View>
    );
  }

  if (!permission.granted) {
    const canAskAgain = permission.canAskAgain !== false;
    return (
      <View style={[styles.fallbackScreen, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.fallbackTopBar}>
          <Text style={styles.fallbackTitle}>
            {locale === 'pt-BR' ? 'Leitor de QR Code' : 'QR Code Scanner'}
          </Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <X size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.fallbackCenter}>
          <View style={styles.fallbackIcon}>
            <Camera size={28} color={colors.brandPrimary} />
          </View>
          <Text style={styles.fallbackHeading}>
            {locale === 'pt-BR'
              ? 'Permissão da câmera necessária'
              : 'Camera permission required'}
          </Text>
          <Text style={styles.fallbackSub}>
            {locale === 'pt-BR'
              ? 'Libere o acesso à câmera para ler o QR Code das etiquetas da bancada e abrir o aparelho na hora.'
              : 'Allow camera access to scan bench labels and open the appliance ticket instantly.'}
          </Text>
          {canAskAgain ? (
            <Button
              label={locale === 'pt-BR' ? 'Permitir câmera' : 'Allow camera'}
              fullWidth={false}
              onPress={() => {
                void requestPermission();
              }}
            />
          ) : (
            <Button
              label={locale === 'pt-BR' ? 'Abrir Ajustes do celular' : 'Open device Settings'}
              fullWidth={false}
              onPress={() => {
                void Linking.openSettings();
              }}
            />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.cameraContainer}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torchOn}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={resolving || errorMessage || multiItemOrder ? undefined : handleBarcodeScanned}
      />

      {/* Top Overlay */}
      <View style={[styles.topOverlay, { paddingTop: Math.max(insets.top + 10, 24) }]}>
        <Pressable onPress={onClose} style={styles.circleBtn} hitSlop={8}>
          <X size={20} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.overlayTitle}>
          {locale === 'pt-BR' ? 'Escanear etiqueta' : 'Scan bench label'}
        </Text>
        <Pressable
          onPress={() => setTorchOn((prev) => !prev)}
          style={[styles.circleBtn, torchOn && styles.circleBtnActive]}
          hitSlop={8}
          accessibilityLabel={locale === 'pt-BR' ? 'Lanterna' : 'Flashlight'}
        >
          {torchOn ? (
            <Flashlight size={19} color="#0F172A" />
          ) : (
            <FlashlightOff size={19} color="#FFFFFF" />
          )}
        </Pressable>
      </View>

      {/* Center Viewfinder */}
      <View style={styles.viewfinderArea} pointerEvents="none">
        <View style={styles.viewfinderBox}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
          {resolving ? (
            <View style={styles.resolvingBadge}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.resolvingText}>
                {locale === 'pt-BR' ? 'Abrindo OS...' : 'Opening order...'}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.viewfinderHint}>
          {locale === 'pt-BR'
            ? 'Aponte a câmera para o QR Code impresso na etiqueta do aparelho'
            : 'Point the camera at the QR code on the appliance label'}
        </Text>
      </View>

      {/* Error feedback bar */}
      {errorMessage ? (
        <View
          style={[
            styles.bottomPanel,
            { paddingBottom: Math.max(insets.bottom + spacing.md, spacing.xxl) },
          ]}
        >
          <View style={styles.errorRow}>
            <AlertCircle size={18} color={colors.danger} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
          <Button
            label={locale === 'pt-BR' ? 'Escanear novamente' : 'Scan again'}
            icon={<RefreshCw size={15} color={colors.textOnDark} />}
            onPress={resetScanner}
          />
        </View>
      ) : null}

      {/* Multi-item picker when scanning an order-level QR code */}
      {multiItemOrder ? (
        <View
          style={[
            styles.bottomPanel,
            { paddingBottom: Math.max(insets.bottom + spacing.md, spacing.xxl) },
          ]}
        >
          <View style={styles.pickerHeader}>
            <View>
              <Text style={styles.pickerTitle}>OS #{multiItemOrder.orderNumber}</Text>
              <Text style={styles.pickerSub}>
                {multiItemOrder.customerName ||
                  (locale === 'pt-BR' ? 'Escolha o aparelho' : 'Choose an appliance')}
              </Text>
            </View>
            <Pressable onPress={resetScanner} hitSlop={8}>
              <Text style={styles.rescanLink}>
                {locale === 'pt-BR' ? 'Ler outro' : 'Scan again'}
              </Text>
            </Pressable>
          </View>

          <ScrollView style={styles.pickerList} contentContainerStyle={styles.pickerListContent}>
            {multiItemOrder.items.map((item) => {
              const label = [item.applianceType, item.brand, item.model].filter(Boolean).join(' ');
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    onClose();
                    onOpenItem(multiItemOrder.id, item.id);
                  }}
                  style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerRowPressed]}
                >
                  <View style={styles.pickerRowLeft}>
                    <TagBadge label={`#${item.tag}`} variant="dark" />
                    <View style={styles.pickerRowCopy}>
                      <Text style={styles.pickerRowTitle} numberOfLines={1}>
                        {label}
                      </Text>
                      <StatusBadge status={item.status} />
                    </View>
                  </View>
                  <ChevronRight size={16} color={colors.textMuted} />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  darkCenter: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  overlayTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtnActive: {
    backgroundColor: '#FACC15',
  },
  viewfinderArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    gap: 18,
  },
  viewfinderBox: {
    width: 248,
    height: 248,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: '#FFFFFF',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 16,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 16,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 16,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 16,
  },
  resolvingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  resolvingText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  viewfinderHint: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: '#FFFFFF',
    textAlign: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  bottomPanel: {
    backgroundColor: colors.bgSurface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: 12,
    maxHeight: '52%',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    padding: 12,
  },
  errorText: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.dangerDark,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pickerTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  pickerSub: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  rescanLink: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.brandPrimary,
  },
  pickerList: {
    maxHeight: 240,
  },
  pickerListContent: {
    gap: 8,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: colors.bgCanvas,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: 10,
  },
  pickerRowPressed: {
    backgroundColor: colors.bgSubtle,
  },
  pickerRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  pickerRowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    alignItems: 'flex-start',
  },
  pickerRowTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  fallbackScreen: {
    flex: 1,
    backgroundColor: colors.bgCanvas,
  },
  fallbackTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  fallbackTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  fallbackCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: 12,
  },
  fallbackIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.brandPrimarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackHeading: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 17,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  fallbackSub: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
});
