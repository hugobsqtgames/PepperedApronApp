import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { ImportTutorial, openInstagram } from '../../features/onboarding/ImportTutorial';
import { space } from '../../theme/tokens';
import { Screen } from '../../ui';

/** How to import a recipe from Instagram, TikTok or Safari, again (from Help). */
export default function Tutorial() {
  return (
    <Screen scroll={false} edges={['top', 'bottom']} maxWidth={560}>
      <ScrollView contentContainerStyle={{ paddingVertical: space.xl, alignItems: 'center' }}>
        <ImportTutorial
          onDone={(tryIt) => {
            router.back();
            if (tryIt) setTimeout(() => void openInstagram(), 400);
          }}
        />
      </ScrollView>
    </Screen>
  );
}
