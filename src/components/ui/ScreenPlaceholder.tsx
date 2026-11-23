import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from './Card';
import { TagBadge } from './TagBadge';
import { colors, fonts, spacing } from '@/theme/tokens';

interface ScreenPlaceholderProps {
  title: string;
  figmaNode: string;
  description: string;
}

export function ScreenPlaceholder({ title, figmaNode, description }: ScreenPlaceholderProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.overline}>BENCHOS MOBILE · INDUSTRIAL CLEAN</Text>
        <Text style={styles.title}>{title}</Text>
        <Card style={styles.card}>
          <TagBadge label={`Figma ${figmaNode}`} variant="brand" />
          <Text style={styles.description}>{description}</Text>
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgCanvas,
  },
  container: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  overline: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textMuted,
  },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: 26,
    color: colors.textPrimary,
  },
  card: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  description: {
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
});
