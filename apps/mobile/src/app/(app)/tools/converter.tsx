import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  CONVERTER_UNITS,
  convertUnits,
  DENSITIES,
  formatNumber,
  getUnit,
  parseNumber,
  unitLabel,
  type ConverterUnit,
  type DensityKey,
  type Locale,
} from '@pepperedapron/core';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/tokens';
import { Chip, Segmented, Text, TextField } from '../../../ui';

const ALL_UNITS: ConverterUnit[] = [...CONVERTER_UNITS.mass, ...CONVERTER_UNITS.volume];

/** Oven: °C, °F and the French "thermostat" (th. 6 ≈ 180 °C). */
function ovenRows(value: number, from: 'c' | 'f' | 'th') {
  const c = from === 'c' ? value : from === 'f' ? ((value - 32) * 5) / 9 : value * 30;
  return {
    c: Math.round(c),
    f: Math.round((c * 9) / 5 + 32),
    th: Math.round((c / 30) * 2) / 2,
  };
}

/**
 * Kitchen converter: weights and volumes (with the density of common ingredients to turn cups
 * and spoons into grams) and oven temperatures. Works offline.
 */
export default function Converter() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const locale = i18n.language as Locale;
  const [mode, setMode] = useState<'amount' | 'oven'>('amount');
  const [raw, setRaw] = useState('1');
  const [from, setFrom] = useState<ConverterUnit>('cup');
  const [to, setTo] = useState<ConverterUnit>('g');
  const [food, setFood] = useState<DensityKey>('flour');
  const [ovenRaw, setOvenRaw] = useState('180');
  const [ovenFrom, setOvenFrom] = useState<'c' | 'f' | 'th'>('c');

  const value = parseNumber(raw.replace(/\s/g, ''));
  const density = DENSITIES.find((d) => d.key === food)?.gPerMl ?? null;
  const needsDensity = getUnit(from)?.dimension !== getUnit(to)?.dimension;
  const result =
    value === null ? null : convertUnits(value, from, to, needsDensity ? density : null);
  const label = (u: ConverterUnit, n: number | null) => unitLabel(u, n ?? 2, locale);

  const ovenValue = parseNumber(ovenRaw.replace(/\s/g, ''));
  const oven = ovenValue === null ? null : ovenRows(ovenValue, ovenFrom);

  const unitChips = (current: ConverterUnit, set: (u: ConverterUnit) => void) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
    >
      {ALL_UNITS.map((u) => (
        <Chip key={u} label={label(u, 2)} selected={current === u} onPress={() => set(u)} />
      ))}
    </ScrollView>
  );

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.xl, gap: space.lg }}
      keyboardShouldPersistTaps="handled"
    >
      <Text variant="title2" accessibilityRole="header">
        {t('converter.title')}
      </Text>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'amount', label: t('converter.amounts') },
          { value: 'oven', label: t('converter.oven') },
        ]}
      />

      {mode === 'amount' ? (
        <>
          <TextField
            label={t('converter.quantity')}
            value={raw}
            onChangeText={setRaw}
            keyboardType="decimal-pad"
            testID="converter-value"
          />
          <Text variant="caption" color="textMuted">
            {t('converter.from')}
          </Text>
          {unitChips(from, setFrom)}
          <Text variant="caption" color="textMuted">
            {t('converter.to')}
          </Text>
          {unitChips(to, setTo)}
          {needsDensity ? (
            <>
              <Text variant="caption" color="textMuted">
                {t('converter.ingredient')}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                {DENSITIES.map((d) => (
                  <Chip
                    key={d.key}
                    label={t(`converter.foods.${d.key}`)}
                    selected={food === d.key}
                    onPress={() => setFood(d.key)}
                  />
                ))}
              </ScrollView>
            </>
          ) : null}
          <View
            style={[styles.result, { backgroundColor: colors.primarySoft }]}
            accessibilityLiveRegion="polite"
          >
            <Text variant="hero" color="primary" testID="converter-result">
              {result === null || value === null
                ? '—'
                : `${formatNumber(result, locale, getUnit(to)?.fractions ?? false)} ${label(to, result)}`}
            </Text>
            {value !== null ? (
              <Text variant="callout" color="textMuted">
                {`${formatNumber(value, locale, getUnit(from)?.fractions ?? false)} ${label(from, value)}${
                  needsDensity ? ` · ${t(`converter.foods.${food}`)}` : ''
                }`}
              </Text>
            ) : null}
          </View>
          <View style={{ gap: 4 }}>
            <Text variant="bodyStrong">{t('converter.handy')}</Text>
            {(t('converter.handyList', { returnObjects: true }) as string[]).map((l) => (
              <Text key={l} variant="callout" color="textMuted">
                • {l}
              </Text>
            ))}
          </View>
        </>
      ) : (
        <>
          <Segmented
            value={ovenFrom}
            onChange={setOvenFrom}
            options={[
              { value: 'c', label: '°C' },
              { value: 'f', label: '°F' },
              { value: 'th', label: t('converter.thermostat') },
            ]}
          />
          <TextField
            label={t('converter.temperature')}
            value={ovenRaw}
            onChangeText={setOvenRaw}
            keyboardType="decimal-pad"
          />
          {oven ? (
            <View style={[styles.result, { backgroundColor: colors.primarySoft }]}>
              <Text variant="title1" color="primary">
                {oven.c} °C
              </Text>
              <Text variant="title2">{oven.f} °F</Text>
              <Text variant="title3" color="textMuted">
                {t('converter.thermostatValue', { value: formatNumber(oven.th, locale, false) })}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: { gap: space.sm },
  result: { gap: space.xs, padding: space.xl, borderRadius: radius.xl, alignItems: 'center' },
});
