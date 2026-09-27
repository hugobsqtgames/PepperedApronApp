import { useEffect, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@pepperedapron/core';
import { useRepos, useSettings } from '../../../hooks/runtime';
import {
  ensureNotificationPermission,
  notificationsAllowed,
  rescheduleReminders,
} from '../../../services/notifications';
import { space } from '../../../theme/tokens';
import { Button, Chip, Group, ListRow, Text } from '../../../ui';

const LABELS: Record<
  NotificationCategory,
  [
    'notifMealReminder' | 'notifShopping' | 'notifPlanning' | 'notifTimers' | 'notifHousehold',
    string,
  ]
> = {
  mealReminder: ['notifMealReminder', 'notifMealReminderBody'],
  shoppingReady: ['notifShopping', 'notifShoppingBody'],
  planningNudge: ['notifPlanning', 'notifPlanningBody'],
  timers: ['notifTimers', 'notifTimersBody'],
  household: ['notifHousehold', 'notifHouseholdBody'],
};
const TIMES = ['11:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00'];

/** Few, useful notifications — each category can be turned off. */
export default function NotificationSettings() {
  const { t } = useTranslation();
  const repos = useRepos();
  const s = useSettings();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    void notificationsAllowed().then(setAllowed);
  }, []);
  const set = async (c: NotificationCategory, v: boolean) => {
    if (v && !(await ensureNotificationPermission())) {
      setAllowed(false);
      return;
    }
    setAllowed(true);
    await repos.updateSettings({ notifications: { ...s.notifications, [c]: v } });
    void rescheduleReminders(repos);
  };
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        padding: space.lg,
        gap: space.xl,
        maxWidth: 640,
        width: '100%',
        alignSelf: 'center',
      }}
    >
      {allowed === false ? (
        <View style={{ gap: space.sm }}>
          <Text color="accent">{t('settings.notifDisabled')}</Text>
          <Button
            title={t('errors.openSettings')}
            variant="secondary"
            onPress={() => void Linking.openSettings()}
          />
        </View>
      ) : null}
      <Group>
        {NOTIFICATION_CATEGORIES.map((c) => (
          <ListRow
            key={c}
            title={t(`settings.${LABELS[c][0]}`)}
            subtitle={t(`settings.${LABELS[c][1]}` as never)}
            toggle={s.notifications[c]}
            onToggle={(v) => void set(c, v)}
          />
        ))}
      </Group>
      {s.notifications.mealReminder ? (
        <View style={{ gap: space.sm }}>
          <Text variant="caption" color="textMuted" weight="600">
            {t('settings.reminderTime')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {TIMES.map((time) => (
              <Chip
                key={time}
                label={time}
                selected={s.dinnerReminderTime === time}
                onPress={async () => {
                  await repos.updateSettings({ dinnerReminderTime: time });
                  void rescheduleReminders(repos);
                }}
              />
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
