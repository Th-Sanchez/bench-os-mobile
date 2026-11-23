import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScreenPlaceholder } from '@/components/ui/ScreenPlaceholder';

export default function PublicTrackScreen() {
  const { publicToken } = useLocalSearchParams<{ publicToken: string }>();
  return (
    <ScreenPlaceholder
      title="Acompanhamento Público de OS"
      figmaNode="1:1405"
      description={`Pronto para implementar a página pública (/track/${publicToken ?? ''}) a partir do Figma.`}
    />
  );
}
