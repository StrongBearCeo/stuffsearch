/** BarcodeImage — renders a visual barcode / QR for a bound code value.
 *  - qr / data_matrix / aztec → QR-style square via react-native-qrcode-svg
 *    (rendered as a generic QR of the raw value).
 *  - linear types (EAN/UPC/Code128/39/93/ITF/codabar) → bars via react-native-svg,
 *    encoded by src/lib/barcode.ts (jsbarcode encoders, no native module).
 *  - unsupported / invalid (pdf417, 'other', bad value for the format) → falls
 *    back to a monospace text chip so the value is still visible.
 *
 *  Tap to enlarge (useful for scanning off the screen); tap again to shrink. */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import QRCode from 'react-native-qrcode-svg';
import { colors, radius } from '../theme';
import { encodeBarcode, isQrLike } from '../lib/barcode';
import type { ExternalCodeType } from '../lib/supabase';

export interface BarcodeImageProps {
  value: string;
  codeType: ExternalCodeType;
  /** Pixel height of the (collapsed) barcode. 1D width is derived from the bar
   *  data so every code fits; QR codes render at `height`×`height`. */
  height?: number;
}

const EXPAND_SCALE = 2.4; // expanded size relative to the collapsed height

export function BarcodeImage({ value, codeType, height = 60 }: BarcodeImageProps) {
  const [expanded, setExpanded] = useState(false);
  // Always call hooks unconditionally (Rules of Hooks): compute the linear
  // encoding up front, then branch on the code type for rendering.
  const bars = useMemo(() => encodeBarcode(value, codeType), [value, codeType]);

  const activeHeight = expanded ? Math.round(height * EXPAND_SCALE) : height;

  function toggle() {
    setExpanded((e) => !e);
  }

  // QR-style: square QR of the raw value.
  if (isQrLike(codeType) && value) {
    return (
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Shrink barcode' : 'Enlarge barcode'}
        style={{ backgroundColor: '#fff', padding: 6, borderRadius: radius.sm, alignSelf: 'flex-start' }}
      >
        <QRCode value={value} size={activeHeight} backgroundColor="#fff" color="#000" />
      </TouchableOpacity>
    );
  }

  if (!bars) {
    // Unsupported format or invalid value — show the raw value clearly.
    return (
      <View style={{ backgroundColor: colors.surfaceAlt, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, alignSelf: 'flex-start' }}>
        <Text style={{ color: colors.text, fontFamily: 'monospace', fontSize: 13 }}>{value}</Text>
      </View>
    );
  }

  // Lay out the run lengths. Each run is a whole number of module units; bars
  // are even indices (0-based), spaces are odd. Scale the unit up when expanded
  // so the bars widen as well as grow taller (stays scannable).
  const unit = expanded ? 4 : 2;
  const totalUnits = bars.bars.reduce((sum, w) => sum + w, 0);
  const width = totalUnits * unit;
  let x = 0;
  const rects: React.ReactElement[] = [];
  bars.bars.forEach((run, i) => {
    if (i % 2 === 0) {
      rects.push(<Rect key={i} x={x} y={0} width={run * unit} height={activeHeight} fill="#000" />);
    }
    x += run * unit;
  });

  return (
    <TouchableOpacity
      onPress={toggle}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={expanded ? 'Shrink barcode' : 'Enlarge barcode'}
      style={{ alignSelf: 'flex-start', overflow: 'hidden', borderRadius: radius.sm }}
    >
      <Svg width={width} height={activeHeight} viewBox={`0 0 ${width} ${activeHeight}`}>
        <Rect x={0} y={0} width={width} height={activeHeight} fill="#fff" />
        {rects}
      </Svg>
    </TouchableOpacity>
  );
}
