import { useRef, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { addDays, formatShoppingQuantity, groupByCategory, startOfWeek, toIsoDate, type Locale } from '@pepperedapron/core';
import type { LocalRecord } from '@pepperedapron/client';
import { useLive, useRepos } from '../../../hooks/runtime';
import { aisleName } from '../../../lib/aisles';
import { errorMessage } from '../../../lib/errors';
import { useLayout } from '../../../lib/layout';
import { track } from '../../../services/analytics';
import { haptic } from '../../../services/haptics';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/tokens';
import { Badge, Button, EmptyState, Icon, IconButton, Text, useActionSheet, usePrompt, useToast } from '../../../ui';

type Item = LocalRecord<'shoppingItem'>;

export default function Shopping() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const repos = useRepos();
  const layout = useLayout();
  const sheet = useActionSheet();
  const prompt = usePrompt();
  const toast = useToast();
  const [text, setText] = useState('');
  const input = useRef<TextInput>(null);

  const { list, items, categories, lists } = useLive(['shoppingList', 'shoppingItem', 'shoppingCategory', 'settings'], (r) => {
    const list = r.activeList();
    return { list, items: list ? r.items(list.id) : [], categories: r.categories(), lists: r.lists() };
  });
  const custom = new Map(categories.map((c) => [c.key, c.name]));
  const order = categories.filter((c) => !c.hidden).map((c) => c.key);
  const groups = groupByCategory(items.map((i) => ({ ...i, categoryKey: i.data.categoryKey, checked: i.data.checked, position: i.data.position })), order);
  const remaining = items.filter((i) => !i.data.checked).length;
  const checkedCount = items.length - remaining;

  const add = async () => {
    const v = text.trim();
    if (!v) return;
    try {
      const l = list ?? (await repos.createList(t('shopping.defaultName')));
      await repos.addItemText(l.id, v);
      haptic.light();
      setText('');
      input.current?.focus();
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };

  const toggle = async (i: Item) => {
    haptic.selection();
    if (!i.data.checked) track('shopping_item_checked');
    await repos.toggleItem(i.id);
    if (!i.data.checked && remaining === 1) haptic.success();
  };

  const fromPlanning = async () => {
    const l = list ?? (await repos.createList(t('shopping.defaultName')));
    const ws = startOfWeek(toIsoDate(new Date()));
    const r = await repos.addPlanToList(l.id, ws, addDays(ws, 6));
    if (r.added + r.updated === 0) return toast(t('planning.toShoppingEmpty'), { tone: 'info' });
    haptic.success();
    track('shopping_generated', { items: r.added + r.updated });
    toast(t('planning.toShoppingDone', { list: l.data.name, added: r.added, updated: r.updated }));
  };

  const menu = () =>
    sheet({
      title: list?.data.name,
      options: [
        { label: t('shopping.fromPlanning'), icon: 'calendar-outline', onPress: () => void fromPlanning() },
        ...(checkedCount ? [{ label: t('shopping.clearChecked'), icon: 'checkmark-done-outline' as const, onPress: () => void repos.clearChecked(list!.id) }] : []),
        { label: t('shopping.lists'), icon: 'list-outline', onPress: () => router.push('/shopping/lists') },
        { label: t('shopping.newList'), icon: 'add-circle-outline', onPress: () => prompt({ title: t('shopping.newList'), placeholder: t('shopping.listExamples'), maxLength: 80, onSubmit: (v) => void repos.createList(v) }) },
        ...(list ? [{ label: t('shopping.renameList'), icon: 'pencil-outline' as const, onPress: () => prompt({ title: t('shopping.renameList'), initial: list.data.name, maxLength: 80, onSubmit: (v) => void repos.updateList(list.id, { name: v }) }) }] : []),
        { label: t('shopping.aisles'), icon: 'swap-vertical-outline', onPress: () => router.push('/shopping/aisles') },
        ...(list
          ? [
              {
                label: t('common.delete'),
                icon: 'trash-outline' as const,
                destructive: true,
                onPress: () =>
                  Alert.alert(t('shopping.deleteList'), t('shopping.deleteListBody'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('common.delete'), style: 'destructive', onPress: () => void repos.deleteList(list.id) },
                  ]),
              },
            ]
          : []),
      ],
    });

  const renderItem = (i: Item) => {
    const qty = formatShoppingQuantity(i.data, i18n.language as Locale);
    const del = () => {
      void repos.removeItem(i.id);
      toast(`${i.data.name} ✕`, { tone: 'info', action: { label: t('common.undo'), onPress: () => void repos.addItem(i.data.listId, { ...i.data }) } });
    };
    return (
      <ReanimatedSwipeable
        key={i.id}
        friction={2}
        rightThreshold={60}
        renderRightActions={() => (
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.delete')} onPress={del} style={[styles.swipeDelete, { backgroundColor: colors.danger }]}>
            <Icon name="trash-outline" size={22} tint="#fff" />
          </Pressable>
        )}
      >
        <View
          style={[styles.item, { backgroundColor: colors.background }]}
          accessible
          accessibilityRole="checkbox"
          accessibilityState={{ checked: i.data.checked }}
          accessibilityLabel={[qty, i.data.name, i.data.note].filter(Boolean).join(' ')}
          accessibilityActions={[{ name: 'activate' }, { name: 'delete', label: t('common.delete') }, { name: 'edit', label: t('common.edit') }]}
          onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'delete' ? del() : e.nativeEvent.actionName === 'edit' ? router.push(`/shopping/item/${i.id}`) : void toggle(i))}
        >
          <Pressable onPress={() => void toggle(i)} hitSlop={8} style={styles.check} testID={`item-check-${i.data.name}`}>
            <Icon name={i.data.checked ? 'checkmark-circle' : 'ellipse-outline'} size={28} tint={i.data.checked ? colors.primary : colors.textSubtle} />
          </Pressable>
          <Pressable style={{ flex: 1, gap: 1, paddingVertical: space.sm }} onPress={() => router.push(`/shopping/item/${i.id}`)}>
            <Text variant="body" style={{ textDecorationLine: i.data.checked ? 'line-through' : 'none', opacity: i.data.checked ? 0.45 : 1 }} numberOfLines={2}>
              {i.data.name}
            </Text>
            {qty || i.data.note || i.data.recipeIds.length ? (
              <Text variant="caption" color="textMuted" numberOfLines={1} style={{ opacity: i.data.checked ? 0.5 : 1 }}>
                {[qty, i.data.note, i.data.recipeIds.length ? t('shopping.fromRecipes', { count: i.data.recipeIds.length }) : null].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </Pressable>
          {i.state !== 'synced' ? <Icon name="cloud-upload-outline" size={14} color="textSubtle" /> : null}
        </View>
      </ReanimatedSwipeable>
    );
  };

  const header = (
    <View style={{ gap: space.md, paddingTop: space.lg, paddingHorizontal: layout.gutter, paddingBottom: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Pressable style={{ flex: 1 }} onPress={() => router.push('/shopping/lists')} accessibilityRole="button" accessibilityHint={t('shopping.lists')}>
          <Text variant="micro" color="accent" style={{ textTransform: 'uppercase' }}>
            {t('shopping.active')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text variant="title1" numberOfLines={1} style={{ flexShrink: 1 }} accessibilityRole="header">
              {list?.data.name ?? t('shopping.title')}
            </Text>
            {lists.length > 1 ? <Icon name="chevron-down" size={18} color="textMuted" /> : null}
          </View>
        </Pressable>
        <IconButton icon="ellipsis-horizontal" label={t('common.more')} onPress={menu} testID="shopping-menu" />
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' }}>
        {items.length ? <Badge label={t('shopping.remaining', { count: remaining })} tone={remaining ? 'primary' : 'accent'} /> : null}
        {list?.data.householdId ? <Badge icon="people-outline" label={t('shopping.shared')} /> : null}
      </View>
      <View style={[styles.addBar, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Icon name="add" size={22} color="primary" />
        <TextInput
          ref={input}
          value={text}
          onChangeText={setText}
          placeholder={t('shopping.addPlaceholder')}
          placeholderTextColor={colors.textSubtle}
          onSubmitEditing={() => void add()}
          returnKeyType="done"
          blurOnSubmit={false}
          style={{ flex: 1, fontSize: 16, color: colors.text, minHeight: 48 }}
          accessibilityLabel={t('shopping.addPlaceholder')}
          testID="shopping-add"
          maxLength={200}
        />
        {text ? <Button title={t('common.add')} size="sm" onPress={add} /> : null}
      </View>
      {items.length > 0 && remaining === 0 ? (
        <View style={[styles.done, { backgroundColor: colors.accentSoft }]}>
          <Text variant="bodyStrong">{t('shopping.allDone')}</Text>
          <Button title={t('shopping.clearChecked')} variant="ghost" size="sm" onPress={() => list && void repos.clearChecked(list.id)} />
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <SectionList
        sections={groups.map((g) => ({ key: g.key, title: aisleName(g.key, custom, t), data: g.items }))}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: space.huge * 2, maxWidth: 760, width: '100%', alignSelf: 'center' }}
        renderSectionHeader={({ section }) => (
          <Text variant="micro" color="textMuted" style={{ textTransform: 'uppercase', paddingHorizontal: layout.gutter, paddingTop: space.lg, paddingBottom: space.xs }} accessibilityRole="header">
            {section.title} · {section.data.filter((x) => !x.data.checked).length}
          </Text>
        )}
        renderItem={({ item }) => <View style={{ paddingHorizontal: layout.gutter }}>{renderItem(item)}</View>}
        ListEmptyComponent={<EmptyState emoji="🛒" title={t('shopping.emptyTitle')} body={t('shopping.emptyBody')} action={t('shopping.fromPlanning')} onAction={() => void fromPlanning()} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  addBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, borderRadius: radius.lg, borderWidth: 1.5 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52 },
  check: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  swipeDelete: { width: 80, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, marginVertical: 4 },
  done: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.md, borderRadius: radius.lg },
});
