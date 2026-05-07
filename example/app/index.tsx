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
import {
  ImageManipulator,
  SaveFormat,
} from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import { captureRef } from 'react-native-view-shot';
import { DitherShader, type DitherType } from 'react-native-shaders';

import {
  ColorPicker as ExpoColorPicker,
  Host,
  HStack,
  LabeledContent,
  Slider as ExpoSlider,
  Section,
  Form,
  Stepper,
  Text as ExpoText,
} from '@expo/ui/swift-ui';
import {
  foregroundStyle,
  monospacedDigit,
} from '@expo/ui/swift-ui/modifiers';

const FALLBACK_PHOTO =
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200&q=80';

const TYPES: readonly DitherType[] = ['2x2', '4x4', '8x8', 'random'];

export default function Demo() {
  const { width, height } = useWindowDimensions();
  const stage = Math.min(width - 32, height * 0.4, 320);

  const [size, setSize] = useState(2);
  const [type, setType] = useState<DitherType>('8x8');
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [colorBack, setColorBack] = useState('#000000');
  const [colorFront, setColorFront] = useState('#ffffff');
  const [source, setSource] = useState<string>(FALLBACK_PHOTO);
  const [sourceKind, setSourceKind] = useState<'image' | 'video'>('image');
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

    if (asset.type === 'video') {
      // ImageManipulator can't decode video URIs — pass straight through;
      // DitherShader sniffs the extension and pre-decodes frames itself.
      setSourceKind('video');
      setSource(asset.uri);
      return;
    }

    try {
      const rendered = await ImageManipulator.manipulate(
        asset.uri,
      ).renderAsync();
      const normalized = await rendered.saveAsync({
        format: SaveFormat.PNG,
      });
      setSourceKind('image');
      setSource(normalized.uri);
    } catch (err) {
      if (__DEV__) {
        console.warn(
          '[example] image normalization failed, using raw uri',
          err,
        );
      }
      setSourceKind('image');
      setSource(asset.uri);
    }
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
          headerRight:
            Platform.OS === 'ios'
              ? undefined
              : () => (
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
      {Platform.OS === 'ios' && (
        <Stack.Toolbar placement="bottom">
          <Stack.Toolbar.Button
            icon="photo.on.rectangle.angled"
            onPress={handlePick}
          />
          <Stack.Toolbar.Menu icon="square.grid.2x2">
            {TYPES.map((t) => (
              <Stack.Toolbar.MenuAction
                key={t}
                isOn={t === type}
                onPress={() => {
                  Haptics.selectionAsync();
                  setType(t);
                }}
              >
                {t}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
          <Stack.Toolbar.Spacer />
          <Stack.Toolbar.Button
            icon="square.and.arrow.down"
            variant="prominent"
            disabled={saving}
            onPress={handleSave}
            separateBackground
          />
        </Stack.Toolbar>
      )}
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
            kind={sourceKind}
            style={{ width: stage, height: stage }}
            size={size}
            type={type}
            scale={scale}
            rotation={rotation}
            colorBack={colorBack}
            colorFront={colorFront}
          />
        </View>
        {Platform.OS === 'ios' ? (
          <NativeControls
            size={size}
            scale={scale}
            rotation={rotation}
            colorBack={colorBack}
            colorFront={colorFront}
            onSizeChange={setSize}
            onScaleChange={setScale}
            onRotationChange={setRotation}
            onColorBackChange={setColorBack}
            onColorFrontChange={setColorFront}
          />
        ) : (
          <ChipControls
            size={size}
            type={type}
            scale={scale}
            rotation={rotation}
            colorBack={colorBack}
            colorFront={colorFront}
            onSizeChange={setSize}
            onTypeChange={setType}
            onScaleChange={setScale}
            onRotationChange={setRotation}
            onColorBackChange={setColorBack}
            onColorFrontChange={setColorFront}
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
  scale,
  rotation,
  colorBack,
  colorFront,
  onSizeChange,
  onScaleChange,
  onRotationChange,
  onColorBackChange,
  onColorFrontChange,
}: {
  size: number;
  scale: number;
  rotation: number;
  colorBack: string;
  colorFront: string;
  onSizeChange: (n: number) => void;
  onScaleChange: (n: number) => void;
  onRotationChange: (n: number) => void;
  onColorBackChange: (c: string) => void;
  onColorFrontChange: (c: string) => void;
}) {
  const valueModifiers = [
    monospacedDigit(),
    foregroundStyle({ type: 'hierarchical' as const, style: 'secondary' as const }),
  ];
  return (
    <Host
      matchContents={{ vertical: true }}
      useViewportSizeMeasurement
      colorScheme="dark"
      style={styles.formHost}
    >
      <Form>
        <Section>
          <Stepper
            label={`Cell size · ${size}px`}
            value={size}
            min={1}
            max={12}
            step={1}
            onValueChange={(v) => onSizeChange(Math.round(v))}
          />
          <LabeledContent label="Scale">
            <ExpoText modifiers={valueModifiers}>
              {scale.toFixed(2)}×
            </ExpoText>
          </LabeledContent>
          <ExpoSlider
            value={scale}
            min={1}
            max={4}
            step={0.05}
            onValueChange={(v) => onScaleChange(Math.round(v * 20) / 20)}
          />
          <LabeledContent label="Rotation">
            <ExpoText modifiers={valueModifiers}>
              {Math.round(rotation)}°
            </ExpoText>
          </LabeledContent>
          <ExpoSlider
            value={rotation}
            min={0}
            max={360}
            step={1}
            onValueChange={(v) => onRotationChange(Math.round(v))}
          />
          <HStack spacing={16}>
            <ExpoColorPicker
              label="Background"
              selection={colorBack}
              supportsOpacity
              onSelectionChange={onColorBackChange}
            />
            <ExpoColorPicker
              label="Foreground"
              selection={colorFront}
              supportsOpacity
              onSelectionChange={onColorFrontChange}
            />
          </HStack>
        </Section>
      </Form>
    </Host>
  );
}

const COLOR_PRESETS = [
  { name: 'B/W', back: '#000000', front: '#ffffff' },
  { name: 'Cyan', back: '#000000', front: '#00b2ff' },
  { name: 'Sepia', back: '#1a0e00', front: '#c67953' },
  { name: 'Mint', back: '#0a1f14', front: '#56ae6c' },
] as const;

function ChipControls({
  size,
  type,
  scale,
  rotation,
  colorBack,
  colorFront,
  onSizeChange,
  onTypeChange,
  onScaleChange,
  onRotationChange,
  onColorBackChange,
  onColorFrontChange,
}: {
  size: number;
  type: DitherType;
  scale: number;
  rotation: number;
  colorBack: string;
  colorFront: string;
  onSizeChange: (n: number) => void;
  onTypeChange: (t: DitherType) => void;
  onScaleChange: (n: number) => void;
  onRotationChange: (n: number) => void;
  onColorBackChange: (c: string) => void;
  onColorFrontChange: (c: string) => void;
}) {
  return (
    <View style={styles.fallback}>
      <View style={styles.group}>
        <Text style={styles.groupTitle}>Pattern</Text>
        <ChipRow
          label="Matrix"
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
      <View style={styles.group}>
        <Text style={styles.groupTitle}>Transform</Text>
        <ChipRow
          label="Scale"
          values={[1, 1.5, 2, 4] as const}
          value={scale}
          onChange={onScaleChange}
        />
        <ChipRow
          label="Rotation"
          values={[0, 90, 180, 270] as const}
          value={rotation}
          onChange={onRotationChange}
        />
      </View>
      <View style={styles.group}>
        <Text style={styles.groupTitle}>Colors</Text>
        <View style={styles.row}>
          <View style={styles.chips}>
            {COLOR_PRESETS.map((preset) => {
              const active =
                preset.back.toLowerCase() === colorBack.toLowerCase() &&
                preset.front.toLowerCase() === colorFront.toLowerCase();
              return (
                <Pressable
                  key={preset.name}
                  onPress={() => {
                    onColorBackChange(preset.back);
                    onColorFrontChange(preset.front);
                  }}
                  style={[styles.swatch, active && styles.swatchActive]}
                >
                  <View
                    style={[
                      styles.swatchFill,
                      { backgroundColor: preset.back },
                    ]}
                  />
                  <View
                    style={[
                      styles.swatchFill,
                      { backgroundColor: preset.front },
                    ]}
                  />
                  <Text style={styles.swatchLabel}>{preset.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
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
  scroll: { flex: 1, backgroundColor: '#070707' },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },
  stageWrap: {
    backgroundColor: '#000',
    borderRadius: 14,
    overflow: 'hidden',
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    boxShadow:
      '0 1px 0 rgba(255,255,255,0.04) inset, 0 18px 48px rgba(0,0,0,0.6)',
  },
  formHost: { width: '100%', maxWidth: 480 },
  fallback: { width: '100%', maxWidth: 480, gap: 28 },
  group: { gap: 14 },
  groupTitle: {
    color: '#7a7a7a',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: 4,
  },
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
  swatch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  swatchActive: { borderColor: '#fafafa' },
  swatchFill: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  swatchLabel: { color: '#fafafa', fontSize: 13, marginLeft: 2 },
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
