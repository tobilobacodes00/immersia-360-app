import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PRIVACY, TERMS } from '@/content/legal';
import { colors, space } from '@/theme';
import { Text } from '@/ui';

/** Privacy Policy or Terms of Use, from Settings › Help. */
export default function LegalScreen() {
  const { doc: which } = useLocalSearchParams<{ doc?: string }>();
  const doc = which === 'terms' ? TERMS : PRIVACY;
  return (
    <>
      <Stack.Screen options={{ title: doc.title }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text variant="footnote" tone="faint">
          Updated {doc.updated}
        </Text>
        {doc.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text variant="headline" accessibilityRole="header">
              {section.heading}
            </Text>
            {section.body.map((p, i) => (
              <Text key={i} tone="muted" style={styles.paragraph}>
                {p}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.xl, gap: space.xl, maxWidth: 720, alignSelf: 'center', width: '100%' },
  section: { gap: space.sm },
  paragraph: { lineHeight: 24 },
});
