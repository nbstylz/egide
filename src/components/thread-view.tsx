import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  Colors,
  GreenColor,
  OnTint,
  RedColor,
  Spacing,
  TintBackground,
  TintBorder,
} from '@/constants/theme';
import type { ThreadMessage } from '@/hooks/use-thread';

type Props = {
  messages: ThreadMessage[];
  loading: boolean;
  failed: boolean;
  refresh: () => Promise<void> | void;
  post: (body: string) => Promise<string | null>;
  remove: (id: string) => Promise<void>;
  report: (id: string) => Promise<void>;
  myId: string | undefined;
  /** Phrase affichée quand personne n'a encore écrit. */
  emptyText: string;
  /** Qui peut lire ce fil, dit une fois, au-dessus du champ de saisie. */
  audienceText: string;
  /** Faux quand le fil est fermé (tournoi annulé, par exemple). */
  canWrite: boolean;
};

/** « 12 juil. 18:04 » */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Un fil de discussion, du plus récent au plus ancien.
 *
 * La liste est inversée : le dernier message est en haut, sous le pouce. C'est
 * l'ordre d'un fil qu'on consulte, pas celui d'une conversation qu'on relit —
 * et cela évite le défilement automatique, qui se bat toujours avec le clavier.
 */
export function ThreadView({
  messages,
  loading,
  failed,
  refresh,
  post,
  remove,
  report,
  myId,
  emptyText,
  audienceText,
  canWrite,
}: Props) {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Identifiant du message dont les actions sont ouvertes. */
  const [openActions, setOpenActions] = useState<string | null>(null);
  const [reported, setReported] = useState<string[]>([]);

  async function send() {
    const body = draft.trim();
    if (body === '' || sending) return;
    setSending(true);
    const message = await post(body);
    setSending(false);
    if (message) {
      setError(message);
      return;
    }
    // Le brouillon n'est vidé qu'une fois le message accepté : une coupure
    // réseau ne doit pas effacer ce qu'on vient d'écrire.
    setDraft('');
    setError(null);
  }

  function renderMessage({ item }: { item: ThreadMessage }) {
    const mine = item.author_id === myId;
    const open = openActions === item.id;

    if (item.deleted) {
      return (
        <View style={[styles.message, { backgroundColor: colors.background }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Message supprimé
          </ThemedText>
        </View>
      );
    }

    return (
      <Pressable
        onLongPress={() => setOpenActions(open ? null : item.id)}
        delayLongPress={300}
        accessibilityRole="button"
        accessibilityLabel={`Message de ${item.author_pseudo}. Appui long pour les actions.`}
        style={[
          styles.message,
          {
            backgroundColor: mine ? TintBackground[mode] : colors.backgroundElement,
            borderColor: mine ? TintBorder[mode] : 'transparent',
          },
        ]}>
        <View style={styles.messageHead}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.author}>
            {item.author_pseudo}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {shortDate(item.created_at)}
          </ThemedText>
        </View>
        <ThemedText type="small">{item.body}</ThemedText>

        {open ? (
          <View style={styles.actions}>
            {item.can_delete ? (
              <Pressable
                onPress={() => {
                  setOpenActions(null);
                  remove(item.id);
                }}
                accessibilityRole="button"
                style={styles.actionButton}>
                <ThemedText type="smallBold" style={{ color: RedColor[mode] }}>
                  Supprimer
                </ThemedText>
              </Pressable>
            ) : null}
            {!mine ? (
              <Pressable
                onPress={() => {
                  setOpenActions(null);
                  setReported((current) => [...current, item.id]);
                  report(item.id);
                }}
                accessibilityRole="button"
                style={styles.actionButton}>
                <ThemedText type="smallBold" style={{ color: colors.tint }}>
                  {reported.includes(item.id) ? 'Signalé' : 'Signaler'}
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {reported.includes(item.id) && !open ? (
          <View style={styles.reportedRow}>
            <Ionicons name="flag" size={12} color={GreenColor[mode]} />
            <ThemedText type="small" style={{ color: GreenColor[mode] }}>
              Signalé à la modération
            </ThemedText>
          </View>
        ) : null}
      </Pressable>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.tint} />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Ionicons name="chatbubbles-outline" size={40} color={colors.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
              {failed ? 'Impossible de charger le fil. Tire vers le bas pour réessayer.' : emptyText}
            </ThemedText>
          </View>
        }
      />

      <View style={[styles.composer, { borderTopColor: colors.backgroundSelected }]}>
        {error ? (
          <ThemedText type="small" style={{ color: RedColor[mode] }}>
            {error}
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {audienceText}
          </ThemedText>
        )}
        {canWrite ? (
          <View style={styles.composerRow}>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, backgroundColor: colors.backgroundElement },
              ]}
              placeholder="Écrire un message"
              placeholderTextColor={colors.textSecondary}
              value={draft}
              onChangeText={(value) => {
                setDraft(value);
                setError(null);
              }}
              multiline
              maxLength={2000}
              editable={!sending}
            />
            <Pressable
              onPress={send}
              disabled={draft.trim() === '' || sending}
              accessibilityRole="button"
              accessibilityLabel="Envoyer"
              style={({ pressed }) => [
                styles.send,
                {
                  backgroundColor: draft.trim() === '' ? colors.backgroundSelected : colors.tint,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}>
              {sending ? (
                <ActivityIndicator color={OnTint[mode]} />
              ) : (
                <Ionicons
                  name="arrow-up"
                  size={20}
                  color={draft.trim() === '' ? colors.textSecondary : OnTint[mode]}
                />
              )}
            </Pressable>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: Spacing.four, flexGrow: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
  },
  centeredText: { textAlign: 'center' },
  message: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    padding: Spacing.two,
    gap: Spacing.half,
  },
  messageHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.one,
  },
  author: { flexShrink: 1 },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingTop: Spacing.one,
  },
  actionButton: { minHeight: 44, justifyContent: 'center' },
  reportedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.half },
  composer: {
    borderTopWidth: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.one,
  },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 15,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
