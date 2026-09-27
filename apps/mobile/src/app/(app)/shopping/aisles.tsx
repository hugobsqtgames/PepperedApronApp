import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLive, useRepos } from '../../../hooks/runtime';
import { aisleName } from '../../../lib/aisles';
import { useTheme } from '../../../theme/ThemeProvider';
import { space } from '../../../theme/tokens';
import { Button, Group, IconButton, ListRow, Text, usePrompt } from '../../../ui';

/** Order aisles like your supermarket; add your own aisles. */
export default function Aisles() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const repos = useRepos();
  const prompt = usePrompt();
  const categories = useLive(['shoppingCategory'], (r) => r.categories());
  const custom = new Map(categories.map((c) => [c.key, c.name]));
  const keys = categories.map((c) => c.key);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= keys.length) return;
    const next = [...keys];
    [next[i], next[j]] = [next[j]!, next[i]!];
    void repos.setCategoryOrder(next);
  };
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: space.xl,
        gap: space.lg,
        maxWidth: 640,
        width: '100%',
        alignSelf: 'center',
      }}
    >
      <Stack.Screen options={{ headerShown: true, title: t('shopping.aisles') }} />
      <Text color="textMuted">{t('shopping.aislesHint')}</Text>
      <Group>
        {categories.map((c, i) => (
          <ListRow
            key={c.key}
            title={aisleName(c.key, custom, t)}
            onPress={
              c.custom
                ? () =>
                    prompt({
                      title: t('common.rename'),
                      initial: aisleName(c.key, custom, t),
                      maxLength: 60,
                      onSubmit: (v) => void repos.renameCategory(c.key, v),
                    })
                : undefined
            }
            chevron={false}
            right={
              <View style={{ flexDirection: 'row' }}>
                <IconButton
                  icon="chevron-up"
                  label={`${t('editor.moveUp')} ${aisleName(c.key, custom, t)}`}
                  variant="plain"
                  size={40}
                  onPress={() => move(i, -1)}
                />
                <IconButton
                  icon="chevron-down"
                  label={`${t('editor.moveDown')} ${aisleName(c.key, custom, t)}`}
                  variant="plain"
                  size={40}
                  onPress={() => move(i, 1)}
                />
              </View>
            }
          />
        ))}
      </Group>
      <Button
        title={t('shopping.newAisle')}
        icon="add"
        variant="secondary"
        onPress={() =>
          prompt({
            title: t('shopping.newAisle'),
            maxLength: 60,
            onSubmit: (v) => void repos.createCategory(v),
          })
        }
      />
    </ScrollView>
  );
}
