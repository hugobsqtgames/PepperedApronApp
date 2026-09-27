import { useState } from 'react';
import { Alert, ScrollView, Share, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRuntime } from '../../../hooks/runtime';
import { errorMessage } from '../../../lib/errors';
import { track } from '../../../services/analytics';
import { space } from '../../../theme/tokens';
import { Button, Group, ListRow, Text, TextField, usePrompt, useToast } from '../../../ui';

/** Household: share lists, planning and chosen recipes with your family — everyone keeps their account. */
export default function Household() {
  const { t } = useTranslation();
  const rt = useRuntime();
  const toast = useToast();
  const prompt = usePrompt();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const h = rt.household;
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };

  if (!h) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.xl, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <Text style={{ fontSize: 44 }} maxFontSizeMultiplier={1}>
          🏡
        </Text>
        <Text color="textMuted">{t('household.intro')}</Text>
        <View style={{ gap: space.sm }}>
          <Text variant="title3">{t('household.create')}</Text>
          <TextField placeholder={t('household.namePlaceholder')} value={name} onChangeText={setName} maxLength={80} testID="household-name" />
          <Button title={t('household.create')} disabled={!name.trim()} onPress={() => run(async () => { const r = await rt.api.createHousehold(name.trim()); await rt.setHousehold(r.household); })} testID="household-create" />
        </View>
        <View style={{ gap: space.sm }}>
          <Text variant="title3">{t('household.join')}</Text>
          <TextField placeholder={t('household.codePlaceholder')} value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" maxLength={12} />
          <Button
            title={t('household.join')}
            variant="secondary"
            disabled={code.trim().length < 4}
            onPress={() =>
              run(async () => {
                const r = await rt.api.joinHousehold(code.trim());
                await rt.setHousehold(r.household);
                track('household_joined');
                toast(t('household.joined', { name: r.household.name }));
              })
            }
          />
        </View>
      </ScrollView>
    );
  }

  const owner = h.myRole === 'owner';
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: space.lg, gap: space.xl, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
      <View style={{ gap: space.xs }}>
        <Text variant="title1">{h.name}</Text>
        <Text color="textMuted">{t('household.sharedHint')}</Text>
      </View>
      <Group title={t('household.members')}>
        {h.members.map((m) => (
          <ListRow
            key={m.userId}
            icon={m.role === 'owner' ? 'star-outline' : 'person-outline'}
            title={`${m.displayName}${m.userId === rt.user?.id ? ` (${t('household.you')})` : ''}`}
            subtitle={m.role === 'owner' ? t('household.owner') : t('household.member')}
            chevron={false}
            right={
              owner && m.userId !== rt.user?.id ? (
                <Button
                  title={t('common.remove')}
                  variant="ghost"
                  size="sm"
                  onPress={() => Alert.alert(t('household.removeMember', { name: m.displayName }), undefined, [{ text: t('common.cancel'), style: 'cancel' }, { text: t('common.remove'), style: 'destructive', onPress: () => void run(async () => { const r = await rt.api.removeHouseholdMember(m.userId); await rt.setHousehold(r.household); }) }])}
                />
              ) : undefined
            }
          />
        ))}
      </Group>
      <Button
        title={t('household.invite')}
        icon="person-add-outline"
        onPress={() =>
          run(async () => {
            const inv = await rt.api.inviteToHousehold();
            await Share.share({ message: t('household.inviteMessage', { name: h.name, code: inv.code, url: inv.url }) });
          })
        }
        testID="household-invite"
      />
      <Text variant="caption" color="textMuted" align="center">
        {t('household.inviteExpires')}
      </Text>
      {owner ? <Button title={t('household.rename')} variant="secondary" onPress={() => prompt({ title: t('household.rename'), initial: h.name, maxLength: 80, onSubmit: (v) => void run(async () => { const r = await rt.api.renameHousehold(v); await rt.setHousehold(r.household); }) })} /> : null}
      <Button
        title={t('household.leave')}
        variant="danger"
        onPress={() => Alert.alert(t('household.leaveConfirm'), t('household.leaveBody'), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('household.leave'), style: 'destructive', onPress: () => void run(async () => { await rt.api.leaveHousehold(); await rt.setHousehold(null); }) }])}
      />
      {owner ? (
        <Button
          title={t('household.dissolve')}
          variant="ghost"
          onPress={() => Alert.alert(t('household.dissolve'), t('household.dissolveBody'), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('common.delete'), style: 'destructive', onPress: () => void run(async () => { await rt.api.dissolveHousehold(); await rt.setHousehold(null); }) }])}
        />
      ) : null}
    </ScrollView>
  );
}
