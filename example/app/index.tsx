import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { DitherShader, type DitherType } from 'react-native-shaders';

const PHOTO =
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200&q=80';

const SIZES = [1, 2, 4, 8];
const TYPES: readonly DitherType[] = ['2x2', '4x4', '8x8', 'random'];

export default function Demo() {
  const { width } = useWindowDimensions();
  const stage = Math.min(width - 32, 360);

  const [size, setSize] = useState(2);
  const [type, setType] = useState<DitherType>('8x8');

  return (
    <View style={styles.root}>
      <DitherShader
        source={PHOTO}
        style={[styles.stage, { width: stage, height: stage }]}
        size={size}
        type={type}
        colorBack="#000000"
        colorFront="#ffffff"
      />

      <Picker label="size" values={SIZES} value={size} onChange={setSize} />
      <Picker
        label="type"
        values={TYPES}
        value={type}
        onChange={setType}
      />
    </View>
  );
}

function Picker<T extends string | number>({
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
