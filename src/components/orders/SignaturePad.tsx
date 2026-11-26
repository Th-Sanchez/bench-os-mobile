import React, { useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Eraser, PenTool, Undo2 } from 'lucide-react-native';
import { colors, fonts, radius } from '@/theme/tokens';

interface Point {
  x: number;
  y: number;
}

const DEFAULT_CANVAS_WIDTH = 340;
const DEFAULT_CANVAS_HEIGHT = 170;
const MIN_POINT_DISTANCE_SQ = 6.25; // 2.5px

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function strokeToPathD(points: Point[]): string {
  if (points.length === 0) return '';
  const first = points[0];
  if (points.length === 1) {
    const x = round1(first.x);
    const y = round1(first.y);
    return `M${x} ${y}L${round1(x + 0.5)} ${y}`;
  }
  const parts: string[] = [`M${round1(first.x)} ${round1(first.y)}`];
  for (let i = 1; i < points.length; i += 1) {
    parts.push(`L${round1(points[i].x)} ${round1(points[i].y)}`);
  }
  return parts.join('');
}

function buildCanonicalSignatureSvg(
  strokes: string[],
  width: number,
  height: number
): string | null {
  if (strokes.length === 0) return null;
  const safeW = Math.max(120, Math.round(width));
  const safeH = Math.max(80, Math.round(height));
  const pathsXml = strokes
    .map(
      (d) =>
        `<path d="${d}" stroke="#0F172A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${safeW} ${safeH}" fill="none">${pathsXml}</svg>`;
}

export function parseCanonicalSignatureSvg(svg: string | null | undefined): {
  viewBox: string;
  paths: string[];
} | null {
  if (!svg || !svg.trim().startsWith('<svg')) return null;
  const vbMatch = svg.match(/viewBox=["']([^"']+)["']/i);
  const viewBox = vbMatch?.[1] ?? `0 0 ${DEFAULT_CANVAS_WIDTH} ${DEFAULT_CANVAS_HEIGHT}`;
  const paths: string[] = [];
  const pathRe = /<path[^>]*\bd=["']([^"']+)["'][^>]*\/?>/gi;
  let match: RegExpExecArray | null = pathRe.exec(svg);
  while (match !== null) {
    if (match[1]) {
      paths.push(match[1]);
    }
    match = pathRe.exec(svg);
  }
  if (paths.length === 0) return null;
  return { viewBox, paths };
}

export function SignaturePreview({
  svg,
  height = 84,
}: {
  svg: string;
  height?: number;
}) {
  const parsed = useMemo(() => parseCanonicalSignatureSvg(svg), [svg]);
  if (!parsed) return null;

  return (
    <View style={[styles.previewBox, { height }]}>
      <Svg width="100%" height="100%" viewBox={parsed.viewBox} preserveAspectRatio="xMidYMid meet">
        {parsed.paths.map((d, idx) => (
          <Path
            key={`${idx}-${d.slice(0, 12)}`}
            d={d}
            stroke={colors.textPrimary}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
      </Svg>
    </View>
  );
}

export function SignaturePad({
  locale,
  onChange,
  onDrawingChange,
}: {
  locale: 'pt-BR' | 'en';
  onChange: (svg: string | null) => void;
  onDrawingChange?: (drawing: boolean) => void;
}) {
  const [size, setSize] = useState({ width: DEFAULT_CANVAS_WIDTH, height: DEFAULT_CANVAS_HEIGHT });
  const [strokes, setStrokes] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string>('');
  const activePointsRef = useRef<Point[]>([]);

  const commitActiveStroke = () => {
    const pts = activePointsRef.current;
    activePointsRef.current = [];
    setActivePath('');
    onDrawingChange?.(false);

    if (pts.length === 0) return;
    const d = strokeToPathD(pts);
    if (!d) return;
    setStrokes((prev) => {
      const next = [...prev, d];
      onChange(buildCanonicalSignatureSvg(next, size.width, size.height));
      return next;
    });
  };

  const handleResponderGrant = (evt: GestureResponderEvent) => {
    onDrawingChange?.(true);
    const { locationX, locationY } = evt.nativeEvent;
    const clamped: Point = {
      x: Math.max(0, Math.min(size.width, locationX)),
      y: Math.max(0, Math.min(size.height, locationY)),
    };
    activePointsRef.current = [clamped];
    setActivePath(strokeToPathD([clamped]));
  };

  const handleResponderMove = (evt: GestureResponderEvent) => {
    const { locationX, locationY } = evt.nativeEvent;
    const x = Math.max(0, Math.min(size.width, locationX));
    const y = Math.max(0, Math.min(size.height, locationY));
    const pts = activePointsRef.current;
    const prev = pts[pts.length - 1];
    if (prev) {
      const dx = x - prev.x;
      const dy = y - prev.y;
      if (dx * dx + dy * dy < MIN_POINT_DISTANCE_SQ) {
        return;
      }
    }
    pts.push({ x, y });
    setActivePath(strokeToPathD(pts));
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 40 && height > 40) {
      setSize({ width: Math.round(width), height: Math.round(height) });
    }
  };

  const handleUndo = () => {
    if (strokes.length === 0) return;
    const next = strokes.slice(0, -1);
    setStrokes(next);
    onChange(buildCanonicalSignatureSvg(next, size.width, size.height));
  };

  const handleClear = () => {
    activePointsRef.current = [];
    setStrokes([]);
    setActivePath('');
    onChange(null);
  };

  const hasStrokes = strokes.length > 0 || activePath.length > 0;

  return (
    <View style={styles.container}>
      <View
        style={[styles.canvasBox, hasStrokes && styles.canvasBoxActive]}
        onLayout={handleLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={handleResponderGrant}
        onResponderMove={handleResponderMove}
        onResponderRelease={commitActiveStroke}
        onResponderTerminate={commitActiveStroke}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${size.width} ${size.height}`}
          pointerEvents="none"
        >
          {strokes.map((d, idx) => (
            <Path
              key={`${idx}-${d.slice(0, 12)}`}
              d={d}
              stroke={colors.textPrimary}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
          {activePath ? (
            <Path
              d={activePath}
              stroke={colors.brandPrimary}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ) : null}
        </Svg>

        <View style={styles.baseline} pointerEvents="none" />

        {!hasStrokes ? (
          <View style={styles.placeholderWrap} pointerEvents="none">
            <PenTool size={16} color={colors.textMuted} />
            <Text style={styles.placeholderText}>
              {locale === 'pt-BR'
                ? 'Assine aqui com o dedo'
                : 'Sign here with your finger'}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.toolbar}>
        <Text style={styles.hintText}>
          {strokes.length > 0
            ? locale === 'pt-BR'
              ? 'Assinatura capturada — irá no comprovante'
              : 'Signature captured — embedded on receipt'
            : locale === 'pt-BR'
              ? 'Opcional · embutida no comprovante e PDF A4'
              : 'Optional · embedded in receipt & PDF'}
        </Text>
        <View style={styles.toolBtns}>
          <Pressable
            onPress={handleUndo}
            disabled={strokes.length === 0}
            style={[styles.toolBtn, strokes.length === 0 && styles.toolBtnDisabled]}
            hitSlop={6}
          >
            <Undo2 size={13} color={colors.textSecondary} />
            <Text style={styles.toolBtnText}>
              {locale === 'pt-BR' ? 'Desfazer' : 'Undo'}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleClear}
            disabled={strokes.length === 0}
            style={[styles.toolBtn, strokes.length === 0 && styles.toolBtnDisabled]}
            hitSlop={6}
          >
            <Eraser size={13} color={colors.danger} />
            <Text style={[styles.toolBtnText, { color: colors.danger }]}>
              {locale === 'pt-BR' ? 'Limpar' : 'Clear'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  canvasBox: {
    height: DEFAULT_CANVAS_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  canvasBoxActive: {
    borderStyle: 'solid',
    borderColor: colors.brandPrimary,
  },
  baseline: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 34,
    height: 1,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderSubtle,
  },
  placeholderWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  placeholderText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textMuted,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  hintText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 11,
    color: colors.textMuted,
    flex: 1,
  },
  toolBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  toolBtnDisabled: {
    opacity: 0.4,
  },
  toolBtnText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  previewBox: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: 'hidden',
  },
});
