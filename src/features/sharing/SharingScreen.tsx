import { Monitor, RefreshCcw } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { updateSettings, useSettings } from '@/data/settings-store';
import {
  clearSharingConfig,
  normaliseServer,
  saveSharingConfig,
  useSharingConfig,
  type SharingConfig,
} from '@/data/sharing-config';
import { useUploads } from '@/data/uploads';
import { LINK_EXPIRY_CHOICES } from '@/domain/settings';
import { formatTakeDate } from '@/features/gallery/TakeRow';
import { uploadQueue, type Upload } from '@/jobs/uploads';
import { sharingApi } from '@/platform/sharing-api';
import { colors, hitSize, radius, space, type as typeScale } from '@/theme';
import { Button, IconButton, QrCard, Row, Section, Segmented, Text, Toggle } from '@/ui';
import { confirmDestructive } from '@/ui/menu';

import { uploadStatusText } from './uploadStatus';

/**
 * QR sharing and the Display. Applies straight away (like the reference's QR sharing screen), so it can be
 * opened from Home or from inside Settings.
 */
export function SharingScreen() {
  const settings = useSettings();
  const config = useSharingConfig();
  const [settingUp, setSettingUp] = useState(false);

  const setSharing = (patch: Partial<typeof settings.sharing>) =>
    updateSettings((s) => ({ ...s, sharing: { ...s.sharing, ...patch } }));

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Section
        title="QR sharing"
        footer="Each finished video is uploaded to your sharing server, and guests scan its QR code to download it. Links expire by themselves."
      >
        <Row
          label="QR sharing"
          right={
            <Toggle
              label="QR sharing"
              value={settings.sharing.enabled && config !== null}
              onChange={(on) => {
                if (on && !config) return setSettingUp(true);
                setSharing({ enabled: on });
                if (on) uploadQueue.retryAll();
              }}
            />
          }
        />
        {config ? (
          <Row
            label="Server"
            value={config.server.replace(/^https:\/\//, '')}
            onPress={() => setSettingUp(true)}
          />
        ) : (
          <Row
            label="Set up sharing"
            detail="Needs your server address and sharing key"
            onPress={() => setSettingUp(true)}
          />
        )}
      </Section>

      {settingUp && (
        <Setup
          current={config}
          onDone={(saved) => {
            setSettingUp(false);
            if (saved) setSharing({ enabled: true });
          }}
        />
      )}

      {config && (
        <>
          <Section title="Links">
            <Row
              label="Link works for"
              right={
                <Segmented
                  label="Link works for"
                  style={styles.segmented}
                  value={settings.sharing.linkExpiryDays}
                  onChange={(linkExpiryDays) => setSharing({ linkExpiryDays })}
                  options={LINK_EXPIRY_CHOICES.map((d) => ({ value: d, label: `${d} days` }))}
                />
              }
            />
            <Row
              label="Upload on Wi-Fi only"
              detail="Saves mobile data; videos wait until Wi-Fi is back"
              right={
                <Toggle
                  label="Upload on Wi-Fi only"
                  value={settings.sharing.wifiOnly}
                  onChange={(wifiOnly) => setSharing({ wifiOnly })}
                />
              }
            />
            <Row
              label="Show QR after each take"
              right={
                <Toggle
                  label="Show QR after each take"
                  value={settings.sharing.showQrAfterTake}
                  onChange={(showQrAfterTake) => setSharing({ showQrAfterTake })}
                />
              }
            />
          </Section>
          <Displays config={config} />
          <Uploads />
          <Button
            label="Remove sharing setup"
            kind="destructive"
            onPress={() =>
              confirmDestructive(
                'Remove the sharing setup?',
                'New videos will not be uploaded. Links that already exist keep working until they expire.',
                'Remove',
                () => {
                  setSharing({ enabled: false });
                  void clearSharingConfig();
                },
              )
            }
          />
        </>
      )}
    </ScrollView>
  );
}

// ------------------------------------------------------------------------------------------------- Setup

function Setup({ current, onDone }: { current: SharingConfig | null; onDone: (saved: boolean) => void }) {
  const [server, setServer] = useState(current?.server ?? '');
  const [key, setKey] = useState('');
  const [state, setState] = useState<{ testing: boolean; message: string | null; ok: boolean }>({
    testing: false,
    message: null,
    ok: false,
  });

  const test = async () => {
    const address = normaliseServer(server);
    if (!address)
      return setState({
        testing: false,
        ok: false,
        message: 'Enter the server address, e.g. share.example.com.',
      });
    const candidate = { server: address, key: key.trim() || current?.key || '' };
    if (!candidate.key) return setState({ testing: false, ok: false, message: 'Enter the sharing key.' });
    setState({ testing: true, ok: false, message: null });
    try {
      await sharingApi.health(candidate);
      await saveSharingConfig(candidate);
      setState({ testing: false, ok: true, message: 'Connected. Sharing is on.' });
      onDone(true);
    } catch (error) {
      setState({
        testing: false,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Section
      title="Sharing setup"
      footer="Both come from your sharing server's setup (see worker/README.md). The key is kept in the iPhone's Keychain."
    >
      <View style={styles.field}>
        <Text variant="footnote" tone="muted">
          Server address
        </Text>
        <TextInput
          value={server}
          onChangeText={setServer}
          placeholder="share.example.com"
          placeholderTextColor={colors.textDisabled}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          textContentType="URL"
          style={styles.input}
          accessibilityLabel="Server address"
          selectionColor={colors.accentText}
        />
      </View>
      <View style={styles.field}>
        <Text variant="footnote" tone="muted">
          Sharing key{current ? ' (leave empty to keep the current one)' : ''}
        </Text>
        <TextInput
          value={key}
          onChangeText={setKey}
          placeholder="Paste the key"
          placeholderTextColor={colors.textDisabled}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          textContentType="password"
          style={styles.input}
          accessibilityLabel="Sharing key"
          selectionColor={colors.accentText}
        />
      </View>
      <View style={styles.field}>
        {state.message && (
          <Text variant="footnote" tone={state.ok ? 'accent' : 'danger'} accessibilityLiveRegion="polite">
            {state.message}
          </Text>
        )}
        <View style={styles.buttons}>
          <Button label="Cancel" kind="ghost" style={styles.flex} onPress={() => onDone(false)} />
          <Button
            label="Test and save"
            style={styles.flex}
            busy={state.testing}
            onPress={() => void test()}
          />
        </View>
      </View>
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------- Displays

type DisplayInfo = { id: string; name: string; connected: boolean };

function Displays({ config }: { config: SharingConfig }) {
  const [displays, setDisplays] = useState<DisplayInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [pairing, setPairing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { displays: list } = await sharingApi.listDisplays(config);
      setDisplays(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [config]);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);

  const pair = async () => {
    setPairing(true);
    try {
      const display = await sharingApi.claimDisplay(config, code);
      setCode('');
      Alert.alert('Display connected', `${display.name} now shows this booth's videos.`);
      await refresh();
    } catch (e) {
      Alert.alert('Could not pair', e instanceof Error ? e.message : String(e));
    } finally {
      setPairing(false);
    }
  };

  return (
    <Section
      title="Display"
      footer={`On a TV, laptop or tablet, open ${config.server.replace(/^https:\/\//, '')}/display. It shows a 6-letter code: enter it here, or scan its QR code with the iPhone camera.`}
    >
      {displays?.map((d) => (
        <Row
          key={d.id}
          label={d.name}
          detail={d.connected ? 'Connected' : 'Not connected right now'}
          right={
            <View style={styles.displayRight}>
              <View
                style={[styles.dot, { backgroundColor: d.connected ? colors.ok : colors.textDisabled }]}
              />
              <Button
                label="Disconnect"
                kind="ghost"
                onPress={() =>
                  confirmDestructive(
                    `Disconnect ${d.name}?`,
                    'It stops showing videos and goes back to its pairing code.',
                    'Disconnect',
                    () => void sharingApi.unpairDisplay(config, d.id).then(refresh),
                  )
                }
              />
            </View>
          }
        />
      ))}
      {displays === null && !error && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      )}
      {error && <Row label="Could not check displays" detail={error} onPress={() => void refresh()} />}
      <View style={styles.pairRow}>
        <Monitor size={20} color={colors.textFaint} />
        <TextInput
          value={code}
          onChangeText={(t) =>
            setCode(
              t
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '')
                .slice(0, 6),
            )
          }
          placeholder="Display code"
          placeholderTextColor={colors.textDisabled}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          style={[styles.input, styles.codeInput]}
          accessibilityLabel="Display code"
          selectionColor={colors.accentText}
        />
        <Button label="Pair" disabled={code.length !== 6} busy={pairing} onPress={() => void pair()} />
      </View>
    </Section>
  );
}

// ----------------------------------------------------------------------------------------------- Uploads

function Uploads() {
  const uploads = useUploads();
  const [shown, setShown] = useState<Upload | null>(null);
  if (!uploads || uploads.length === 0) return null;
  const pending = uploads.filter((u) => u.status !== 'online').length;

  return (
    <>
      <View style={styles.uploadsHeader}>
        <Text variant="overline" tone="faint">
          Uploads{pending ? ` · ${pending} to go` : ''}
        </Text>
        {pending > 0 && (
          <IconButton
            icon={RefreshCcw}
            label="Retry all"
            size={18}
            color={colors.accentText}
            onPress={() => uploadQueue.retryAll()}
          />
        )}
      </View>
      <Section>
        {uploads.slice(0, 50).map((u) => (
          <Pressable
            key={u.takeId}
            onPress={() => u.url && setShown(u)}
            disabled={!u.url}
            accessibilityRole="button"
            style={({ pressed }) => [styles.uploadRow, pressed && styles.pressed]}
          >
            <View style={styles.flex}>
              <Text numberOfLines={1}>{formatTakeDate(u.createdAt)}</Text>
              <Text variant="footnote" tone={u.status === 'failed' ? 'danger' : 'faint'} numberOfLines={2}>
                {uploadStatusText(u)}
                {u.status === 'failed' && u.error ? ` (${u.error})` : ''}
              </Text>
            </View>
            {u.status === 'uploading' && <ActivityIndicator color={colors.accentText} />}
          </Pressable>
        ))}
      </Section>
      <Modal visible={shown !== null} transparent animationType="fade" onRequestClose={() => setShown(null)}>
        <SafeAreaView style={styles.modal}>
          {shown?.url && <QrCard url={shown.url} status={uploadStatusText(shown)} size={240} />}
          <Button label="Close" kind="secondary" onPress={() => setShown(null)} />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg },
  flex: { flex: 1 },
  segmented: { width: 210 },
  field: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.xs },
  input: {
    ...typeScale.body,
    color: colors.text,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
  },
  buttons: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  displayRight: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dot: { width: 10, height: 10, borderRadius: 5 },
  loading: { padding: space.lg },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    paddingLeft: space.lg,
  },
  codeInput: { flex: 1, letterSpacing: 4, fontWeight: '600' },
  uploadsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: space.lg,
    marginBottom: space.xs,
    minHeight: hitSize,
  },
  uploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    paddingLeft: space.lg,
  },
  pressed: { backgroundColor: colors.surfacePressed },
  modal: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    padding: space.xl,
    gap: space.lg,
  },
});
