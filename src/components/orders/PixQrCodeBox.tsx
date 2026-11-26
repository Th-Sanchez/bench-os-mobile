import React, { useMemo } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import QRCode from 'qrcode';
import { QrCode, Share2 } from 'lucide-react-native';
import { colors, fonts, radius } from '@/theme/tokens';

interface PixQrCodeBoxProps {
  payload: string;
  formattedAmount: string;
  locale: 'pt-BR' | 'en';
  size?: number;
}

export function PixQrCodeBox({
  payload,
  formattedAmount,
  locale,
  size = 188,
}: PixQrCodeBoxProps) {
  const qrGeometry = useMemo(() => {
    try {
      const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
      const count = qr.modules.size;
      const margin = 2;
      const viewSize = count + margin * 2;
      const parts: string[] = [];

      for (let y = 0; y < count; y += 1) {
        let x = 0;
        while (x < count) {
          if (qr.modules.get(y, x)) {
            const start = x;
            while (x < count && qr.modules.get(y, x)) {
              x += 1;
            }
            const len = x - start;
            parts.push(`M${start + margin} ${y + margin}h${len}v1h-${len}z`);
          } else {
            x += 1;
          }
        }
      }
      return { viewSize, pathData: parts.join('') };
    } catch {
      return null;
    }
  }, [payload]);

  if (!qrGeometry) return null;

  const handleShareCode = async () => {
    try {
      await Share.share({
        message: payload,
      });
    } catch {
      // User dismissed share sheet
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <QrCode size={15} color="#0F766E" />
          <Text style={styles.title}>
            {locale === 'pt-BR' ? 'QR Code Pix' : 'Pix QR Code'}
          </Text>
        </View>
        <Text style={styles.amount}>{formattedAmount}</Text>
      </View>

      <View style={styles.qrFrame}>
        <Svg
          width={size}
          height={size}
          viewBox={`0 0 ${qrGeometry.viewSize} ${qrGeometry.viewSize}`}
        >
          <Rect
            x={0}
            y={0}
            width={qrGeometry.viewSize}
            height={qrGeometry.viewSize}
            fill="#FFFFFF"
          />
          <Path d={qrGeometry.pathData} fill="#0F172A" />
        </Svg>
      </View>

      <Pressable
        onPress={() => void handleShareCode()}
        style={({ pressed }) => [styles.shareBtn, pressed && styles.shareBtnPressed]}
      >
        <Share2 size={14} color={colors.textOnDark} />
        <Text style={styles.shareBtnText}>
          {locale === 'pt-BR' ? 'Enviar / Copiar Pix Copia e Cola' : 'Share Pix Copy-Paste Code'}
        </Text>
      </Pressable>

      <Text style={styles.hint}>
        {locale === 'pt-BR'
          ? 'Mostre a tela para o cliente escanear no app do banco e confira o recebimento antes de confirmar.'
          : 'Let the customer scan with their bank app and verify payment before confirming.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: radius.md,
    padding: 12,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 13.5,
    color: '#0F766E',
  },
  amount: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  qrFrame: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  shareBtn: {
    height: 40,
    borderRadius: radius.md,
    backgroundColor: '#0F766E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  shareBtnPressed: {
    opacity: 0.85,
  },
  shareBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: colors.textOnDark,
  },
  hint: {
    fontFamily: fonts.bodyRegular,
    fontSize: 11.5,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
});
