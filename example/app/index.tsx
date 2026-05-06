import { Image } from 'expo-image';
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { DitherShader } from 'react-native-shaders';

const PHOTO =
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200&q=80';

const SCALES = [2, 4, 8, 16];
const INTENSITIES = [0.25, 0.5, 0.75, 1];
const SPEEDS = [0, 0.5, 1, 2];

export default function Demo() {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 32, 360);

  const [scale, setScale] = useState(4);
  const [intensity, setIntensity] = useState(0.5);
  const [speed, setSpeed] = useState(1);

  return (
    <View style={styles.root}>
      <View style={[styles.stage, { width: size, height: size }]}>
        <Image source={PHOTO} style={StyleSheet.absoluteFill} contentFit="cover" />
        <DitherShader
          style={StyleSheet.absoluteFill}
          scale={scale}
          intensity={intensity}
          speed={speed}
          color="#000"
        />
      </View>

      <Picker label="scale" values={SCALES} value={scale} onChange={setScale} />
      <Picker
        label="intensity"
        values={INTENSITIES}
        value={intensity}
        onChange={setIntensity}
      />
      <Picker label="speed" values={SPEEDS} value={speed} onChange={setSpeed} />
    </View>
  );
}

function Picker<T extends number>({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {values.map((v) => {
          const active = v === value;
          return (
            <Pressable
              key={String(v)}
              onPress={() => onChange(v)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text
                style={[styles.chipText, active && styles.chipTextActive]}
              >
                {String(v)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 12,
  },
  stage: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#222',
  },
  row: { width: '100%', maxWidth: 360 },
  label: { color: '#aaa', fontSize: 12, marginBottom: 6 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1f1f1f',
  },
  chipActive: { backgroundColor: '#fafafa' },
  chipText: { color: '#fafafa', fontSize: 14 },
  chipTextActive: { color: '#0b0b0b', fontWeight: '600' },
});
