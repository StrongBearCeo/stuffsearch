/** ExpoImage — expo-image with a graceful fallback to a plain View when no URI. */
import React from 'react';
import { Image } from 'expo-image';
import { View } from 'react-native';

export function ExpoImage({
  uri,
  style,
}: {
  uri?: string | null;
  style?: import('react-native').ImageStyle;
}) {
  if (!uri) return <View style={style} />;
  return <Image source={{ uri }} style={style} contentFit="cover" transition={120} />;
}
