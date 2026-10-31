import { useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  addDays,
  formatShoppingQuantity,
  PANTRY_PLACES,
  parseReceipt,
  toIsoDate,
  type Locale,
  type PantryPlace,
  type ReceiptItem,
} from '@pepperedapron/core';
import { useRepos } from '../../hooks/runtime';
import { errorMessage } from '../../lib/errors';
import { haptic } from '../../services/haptics';
import { readTextFromImage, readTextLines } from '../../services/ocr';
import { pickImage, type PhotoSource } from '../../services/photos';
import { lookupBarcode, type ScannedProduct } from '../../services/products';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import {
  Button,
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  IconButton,
  LoadingState,
  Screen,
  Text,
  usePrompt,
  useToast,
} from '../../ui';

/**
 * Filling the pantry without typing: a photo of the supermarket receipt (its products are read
 * on the iPhone, checked, then put away) or the barcodes of the products, scanned one by one.
 */
export default function PantryScan() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = params.mode === 'barcode' ? 'barcode' : 'receipt';
  return (
    <Screen scroll={false} edges={['top', 'bottom']} maxWidth={640}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: space.md }}>
        <Text variant="title1" style={{ flex: 1 }} accessibilityRole="header">
          {mode === 'barcode' ? t('pantryScan.barcodeTitle') : t('pantryScan.receiptTitle')}
        </Text>
        <IconButton icon="close" label={t('common.close')} onPress={() => router.back()} />
      </View>
      {mode === 'barcode' ? <BarcodeScanner /> : <ReceiptReader />}
    </Screen>
  );
}

const PLACE_ICONS = {
  pantry: 'file-tray-stacked-outline',
  fridge: 'snow-outline',
  freezer: 'cube-outline',
} as const;

function ReceiptReader() {
  const { t, i18n } = useTranslation();
  const repos = useRepos();
  const toast = useToast();
  const prompt = usePrompt();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<(ReceiptItem & { keep: boolean })[] | null>(null);
  const locale = i18n.language as Locale;

  const read = async (source: PhotoSource) => {
    const r = await pickImage(source);
    if (!r) return;
    if ('denied' in r) {
      Alert.alert(
        source === 'camera' ? t('errors.cameraPermission') : t('errors.photoPermission'),
        undefined,
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('errors.openSettings'), onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }
    setBusy(true);
    try {
      // With positions, a name and its price read apart are put back on the same line.
      const lines = await readTextLines(r.uri);
      const found = lines
        ? parseReceipt(lines)
        : parseReceipt((await readTextFromImage(r.uri)).split('\n'));
      setItems(found.map((i) => ({ ...i, keep: i.food })));
      if (!found.length) toast(t('pantryScan.nothing'), { tone: 'info' });
    } catch {
      toast(t('import.ocrUnavailable'), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const update = (i: number, patch: Partial<ReceiptItem & { keep: boolean }>) =>
    setItems((l) => l && l.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const nextPlace = (p: PantryPlace): PantryPlace =>
    PANTRY_PLACES[(PANTRY_PLACES.indexOf(p) + 1) % PANTRY_PLACES.length]!;
  const chosen = items?.filter((i) => i.keep) ?? [];

  const save = async () => {
    try {
      for (const i of chosen)
        await repos.addPantryItem({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          place: i.place,
        });
      haptic.success();
      toast(t('pantryScan.saved', { count: chosen.length }));
      router.back();
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };

  if (busy) return <LoadingState label={t('pantryScan.reading')} />;
  if (!items?.length)
    return (
      <View style={{ gap: space.md, marginTop: space.xl }}>
        <Text color="textMuted">{t('pantryScan.receiptBody')}</Text>
        <Button
          title={t('pantryScan.takePhoto')}
          icon="camera-outline"
          onPress={() => void read('camera')}
          testID="receipt-camera"
        />
        <Button
          title={t('editor.chooseLibrary')}
          icon="images-outline"
          variant="secondary"
          onPress={() => void read('library')}
        />
        <Text variant="caption" color="textMuted">
          {t('pantryScan.receiptTip')}
        </Text>
      </View>
    );
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ gap: space.sm, paddingVertical: space.lg }}>
        <Text variant="callout" color="textMuted">
          {t('pantryScan.review')}
        </Text>
        {items.map((it, i) => (
          <View
            key={`${it.name}-${i}`}
            style={[styles.row, { borderColor: colors.line, backgroundColor: colors.surface }]}
          >
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: it.keep }}
              accessibilityLabel={it.name}
              onPress={() => {
                haptic.selection();
                update(i, { keep: !it.keep });
              }}
              hitSlop={8}
            >
              <Icon
                name={it.keep ? 'checkmark-circle' : 'ellipse-outline'}
                size={26}
                tint={it.keep ? colors.primary : colors.line}
              />
            </Pressable>
            <Pressable
              style={{ flex: 1 }}
              accessibilityRole="button"
              accessibilityHint={t('pantryScan.rename')}
              onPress={() =>
                prompt({
                  title: t('pantryScan.rename'),
                  initial: it.name,
                  maxLength: 80,
                  onSubmit: (v) => update(i, { name: v }),
                })
              }
            >
              <Text variant="body" style={{ opacity: it.keep ? 1 : 0.5 }}>
                {it.name}
              </Text>
              {it.quantity !== null ? (
                <Text variant="caption" color="textMuted">
                  {formatShoppingQuantity(it, locale)}
                </Text>
              ) : null}
            </Pressable>
            <IconButton
              icon={PLACE_ICONS[it.place]}
              label={`${t(`pantry.places.${it.place}`)} — ${t('pantryScan.changePlace')}`}
              onPress={() => update(i, { place: nextPlace(it.place) })}
              size={40}
            />
          </View>
        ))}
      </ScrollView>
      <View style={{ gap: space.sm, paddingBottom: space.md }}>
        <Button
          title={t('pantryScan.save', { count: chosen.length })}
          icon="checkmark"
          disabled={!chosen.length}
          onPress={() => void save()}
          testID="receipt-save"
        />
        <Button title={t('pantryScan.another')} variant="ghost" onPress={() => setItems(null)} />
      </View>
    </View>
  );
}

const EXPIRY_DAYS = [null, 3, 7, 30] as const;

function BarcodeScanner() {
  const { t, i18n } = useTranslation();
  const repos = useRepos();
  const toast = useToast();
  const prompt = usePrompt();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [found, setFound] = useState<ScannedProduct | null>(null);
  const [looking, setLooking] = useState(false);
  const [expiry, setExpiry] = useState<number | null>(null);
  const [added, setAdded] = useState(0);
  // The camera keeps reporting the same code: one lookup at a time, not twice the same code.
  const busy = useRef(false);
  const last = useRef('');

  const onScan = async (r: BarcodeScanningResult) => {
    if (busy.current || found || r.data === last.current) return;
    busy.current = true;
    last.current = r.data;
    haptic.light();
    setLooking(true);
    try {
      const p = await lookupBarcode(r.data, i18n.language);
      if (p) {
        setExpiry(null);
        setFound(p);
      } else
        prompt({
          title: t('pantryScan.unknown'),
          message: t('pantryScan.unknownBody'),
          placeholder: t('pantry.addPlaceholder'),
          maxLength: 80,
          onSubmit: (name) =>
            setFound({ code: r.data, name, quantity: null, unit: null, place: 'pantry' }),
        });
    } catch {
      toast(t('pantryScan.offline'), { tone: 'error' });
      last.current = '';
    } finally {
      setLooking(false);
      busy.current = false;
    }
  };

  const add = async () => {
    if (!found) return;
    try {
      await repos.addPantryItem({
        name: found.name,
        quantity: found.quantity,
        unit: found.unit,
        place: found.place,
        expiresOn: expiry ? addDays(toIsoDate(new Date()), expiry) : null,
      });
      haptic.success();
      setAdded((n) => n + 1);
      toast(t('pantryScan.added', { name: found.name }));
      setFound(null);
      last.current = '';
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };

  if (!permission) return <LoadingState />;
  if (!permission.granted)
    return (
      <EmptyState
        emoji="📷"
        title={t('pantryScan.cameraTitle')}
        body={t('pantryScan.cameraBody')}
        action={permission.canAskAgain ? t('pantryScan.allowCamera') : t('errors.openSettings')}
        onAction={() =>
          permission.canAskAgain ? void requestPermission() : void Linking.openSettings()
        }
      />
    );
  return (
    <View style={{ flex: 1, gap: space.md, paddingVertical: space.md }}>
      <View style={[styles.camera, { borderColor: colors.line }]}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
          onBarcodeScanned={found || looking ? undefined : (r) => void onScan(r)}
          accessibilityLabel={t('pantryScan.cameraLabel')}
        />
        <View style={[styles.aim, { borderColor: '#FFFCF6' }]} pointerEvents="none" />
        {looking ? (
          <View style={styles.overlay}>
            <LoadingState label={t('pantryScan.looking')} />
          </View>
        ) : null}
      </View>
      {found ? (
        <View style={[styles.found, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text variant="title3" accessibilityLiveRegion="polite">
            {found.name}
          </Text>
          {found.quantity !== null ? (
            <Text variant="callout" color="textMuted">
              {formatShoppingQuantity(found, i18n.language as Locale)}
            </Text>
          ) : null}
          <ChipRow>
            {PANTRY_PLACES.map((p) => (
              <Chip
                key={p}
                icon={PLACE_ICONS[p]}
                label={t(`pantry.places.${p}`)}
                selected={found.place === p}
                onPress={() => setFound({ ...found, place: p })}
              />
            ))}
          </ChipRow>
          <ChipRow>
            {EXPIRY_DAYS.map((d) => (
              <Chip
                key={String(d)}
                icon="calendar-outline"
                label={d === null ? t('pantry.noDate') : t('pantry.expiresIn', { count: d })}
                selected={expiry === d}
                onPress={() => setExpiry(d)}
              />
            ))}
          </ChipRow>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button
              title={t('pantryScan.add')}
              icon="add"
              onPress={() => void add()}
              style={{ flex: 1 }}
              testID="barcode-add"
            />
            <Button
              title={t('common.cancel')}
              variant="ghost"
              onPress={() => {
                setFound(null);
                last.current = '';
              }}
            />
          </View>
        </View>
      ) : (
        <Text variant="callout" color="textMuted" align="center">
          {added ? t('pantryScan.addedCount', { count: added }) : t('pantryScan.aim')}
        </Text>
      )}
      <Text variant="caption" color="textMuted" align="center">
        {t('pantryScan.privacy')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  camera: {
    height: 280,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aim: { width: '70%', height: 110, borderWidth: 3, borderRadius: radius.lg, opacity: 0.85 },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
  },
  found: { gap: space.sm, padding: space.lg, borderRadius: radius.xl, borderWidth: 1 },
});
