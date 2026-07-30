import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, useColorScheme, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { formatCode, spellCode } from '@/lib/invite-code';

type Props = {
  code: string;
  teamName: string;
  onRegenerate: () => Promise<void>;
};

function Action({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: colors.background, opacity: pressed || disabled ? 0.7 : 1 },
      ]}>
      <Ionicons name={icon} size={18} color={colors.text} />
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
  );
}

/**
 * Le code d'invitation, affiché en grand : c'est ce que le capitaine dicte
 * ou copie. Régénérer révoque l'ancien code, d'où la confirmation.
 */
export function InviteCodeCard({ code, teamName, onRegenerate }: Props) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function copy() {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    await Share.share({
      message: `Rejoins « ${teamName} » sur EGIDE avec le code ${formatCode(code)}.`,
    });
  }

  async function regenerate() {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 5000);
      return;
    }
    setConfirming(false);
    setBusy(true);
    await onRegenerate();
    setBusy(false);
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
      <ThemedText type="small" themeColor="textSecondary">
        Code d’invitation
      </ThemedText>
      <ThemedText
        style={[styles.code, { color: colors.tint }]}
        accessibilityLabel={`Code d’invitation : ${spellCode(code)}`}>
        {formatCode(code)}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
        Partage-le aux joueurs que tu veux recruter.
      </ThemedText>

      <View style={styles.actions}>
        <Action
          icon={copied ? 'checkmark' : 'copy-outline'}
          label={copied ? 'Copié' : 'Copier'}
          onPress={copy}
        />
        <Action icon="share-outline" label="Partager" onPress={share} />
        <Action
          icon="refresh"
          label={confirming ? 'Confirmer' : 'Régénérer'}
          onPress={regenerate}
          disabled={busy}
        />
      </View>

      {confirming ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          L’ancien code cessera de fonctionner immédiatement.
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
    alignItems: 'center',
  },
  code: {
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '700',
    letterSpacing: 4,
  },
  hint: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
    alignSelf: 'stretch',
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    minHeight: 44,
    borderRadius: Spacing.two,
  },
});
