import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { captureRef } from 'react-native-view-shot';
import { DitherShader, type DitherType } from 'react-native-shaders';

import {
  Host,
  Picker as ExpoPicker,
  Slider as ExpoSlider,
  Section,
  Form,
  Text as ExpoText,
} from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';

const FALLBACK_PHOTO =
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200&q=80';

const TYPES: readonly DitherType[] = ['2x2', '4x4', '8x8', 'random'];

export default function Demo() {
  const { width } = useWindowDimensions();
  const stage = Math.min(width - 32, 360);

  const [size, setSize] = useState(2);
  const [type, setType] = useState<DitherType>('8x8');
  const [source, setSource] = useState<string>(FALLBACK_PHOTO);
  const [saving, setSaving] = useState(false);

  const stageRef = useRef<View>(null);

  const handlePick = useCallback(async () => {
    Haptics.selectionAsync();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setSource(asset.uri);
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) {
        Alert.alert(
          'Cannot save',
          'Photo library permission is required to save dithered images.',
        );
        return;
      }

      const uri = await captureRef(stageRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      await MediaLibrary.saveToLibraryAsync(uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Dithered image added to your photo library.');
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Save failed',
        err instanceof Error ? err.message : 'Unknown error',
      );
    } finally {
      setSaving(false);
    }
  }, [saving]);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Dither',
          headerRight: () => (
            <View style={styles.headerActions}>
              <HeaderButton label="Pick" onPress={handlePick} />
              <HeaderButton
                label={saving ? 'Saving…' : 'Save'}
                onPress={handleSave}
                disabled={saving}
                emphasized
              />
            </View>
          ),
        }}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View
          ref={stageRef}
          collapsable={false}
          style={[
            styles.stageWrap,
            { width: stage, height: stage },
          ]}
        >
          <DitherShader
            source={source}
            style={{ width: stage, height: stage }}
            size={size}
            type={type}
            colorBack="#000000"
            colorFront="#ffffff"
          />
        </View>

        {Platform.OS === 'ios' ? (
          <NativeControls
            size={size}
            type={type}
            onSizeChange={setSize}
            onTypeChange={setType}
          />
        ) : (
          <ChipControls
            size={size}
            type={type}
            onSizeChange={setSize}
            onTypeChange={setType}
          />
        )}
      </ScrollView>
    </>
  );
}

function HeaderButton({
  label,
  onPress,
  emphasized,
  disabled,
}: {
  label: string;
  onPress: () => void;
  emphasized?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.headerButton,
        emphasized && styles.headerButtonEmphasized,
        (pressed || disabled) && { opacity: 0.5 },
      ]}
      hitSlop={8}
    >
      <Text
        style={[
          styles.headerButtonText,
          emphasized && styles.headerButtonTextEmphasized,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function NativeControls({
  size,
  type,
  onSizeChange,
  onTypeChange,
}: {
  size: number;
  type: DitherType;
  onSizeChange: (n: number) => void;
  onTypeChange: (t: DitherType) => void;
}) {
  const typeIndex = TYPES.indexOf(type);
  return (
    <Host
      matchContents
      colorScheme="dark"
      style={styles.formHost}
    >
      <Form>
        <Section title="Pattern">
          <ExpoPicker
            label="Matrix"
            selection={typeIndex < 0 ? 0 : typeIndex}
            onSelectionChange={(index) => {
              Haptics.selectionAsync();
              onTypeChange(TYPES[index] ?? '8x8');
            }}
            modifiers={[pickerStyle('segmented')]}
          >
            {TYPES.map((t, i) => (
              <ExpoText key={t} modifiers={[tag(i)]}>
                {t}
              </ExpoText>
            ))}
          </ExpoPicker>
        </Section>
        <Section title={`Cell size — ${size}px`}>
          <ExpoSlider
            value={size}
            min={1}
            max={12}
            step={1}
            onValueChange={(v) => onSizeChange(Math.round(v))}
          />
        </Section>
      </Form>
    </Host>
  );
}

function ChipControls({
  size,
  type,
  onSizeChange,
  onTypeChange,
}: {
  size: number;
  type: DitherType;
  onSizeChange: (n: number) => void;
  onTypeChange: (t: DitherType) => void;
}) {
  return (
    <View style={styles.fallback}>
      <ChipRow
        label="Pattern"
        values={TYPES}
        value={type}
        onChange={onTypeChange}
      />
      <ChipRow
        label="Cell size"
        values={[1, 2, 4, 8] as const}
        value={size}
        onChange={onSizeChange}
      />
    </View>
  );
}

function ChipRow<T extends string | number>({
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
      <Text style={styles.rowLabel}>{label}</Text>
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
  scroll: { flex: 1, backgroundColor: '#0b0b0b' },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 48,
    gap: 24,
  },
  stageWrap: {
    backgroundColor: '#222',
    borderRadius: 18,
    overflow: 'hidden',
    borderCurve: 'continuous',
    boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  },
  formHost: { width: '100%', maxWidth: 480 },
  fallback: { width: '100%', maxWidth: 480, gap: 16 },
  row: { width: '100%' },
  rowLabel: { color: '#aaa', fontSize: 12, marginBottom: 6 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1f1f1f',
  },
  chipActive: { backgroundColor: '#fafafa' },
  chipText: { color: '#fafafa', fontSize: 14 },
  chipTextActive: { color: '#0b0b0b', fontWeight: '600' },
  headerActions: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerButtonEmphasized: { backgroundColor: '#fafafa' },
  headerButtonText: { color: '#fafafa', fontSize: 15, fontWeight: '500' },
  headerButtonTextEmphasized: { color: '#0b0b0b', fontWeight: '600' },
});
