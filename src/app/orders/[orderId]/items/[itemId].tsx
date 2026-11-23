import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScreenPlaceholder } from '@/components/ui/ScreenPlaceholder';

export default function ApplianceDetailScreen() {
  const { orderId, itemId } = useLocalSearchParams<{ orderId: string; itemId: string }>();
  return (
    <ScreenPlaceholder
      title="Detalhe do Aparelho"
      figmaNode="1:183"
      description={`Pronto para implementar Detalhe do Aparelho (OS ${orderId ?? ''} / Item ${itemId ?? ''}) a partir do Figma.`}
    />
  );
}
