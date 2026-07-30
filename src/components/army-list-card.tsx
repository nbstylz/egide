import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  Colors,
  Fonts,
  GreenBackground,
  GreenColor,
  OnTint,
  RedBackground,
  RedColor,
  Spacing,
  TintBackground,
} from '@/constants/theme';
import type { ArmyList } from '@/hooks/use-army-list';

type Props = {
  list: ArmyList | null;
  /** Vrai tant que le tournoi est « inscriptions ouvertes » : on peut soumettre. */
  submissionsOpen: boolean;
  onOpen: () => void;
};

/** « 12 juil. 18:04 » à partir d'un horodatage ISO. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Résumé de ma liste d'armée sur la fiche événement : le statut se lit au
 * badge ET au texte, jamais à la couleur seule. La saisie vit dans l'écran
 * dédié — jamais de champ multiligne sur la fiche.
 */
export function ArmyListCard({ list, submissionsOpen, onOpen }: Props) {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];

  let badge;
  if (!list) {
    badge = (
      <View style={[styles.badge, { borderWidth: 1, borderColor: colors.backgroundSelected }]}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.badgeText}>
          Non soumise
        </ThemedText>
      </View>
    );
  } else if (list.status === 'approved') {
    badge = (
      <View style={[styles.badge, { backgroundColor: GreenBackground[mode] }]}>
        <ThemedText type="smallBold" style={[styles.badgeText, { color: GreenColor[mode] }]}>
          Validée
        </ThemedText>
      </View>
    );
  } else if (list.status === 'rejected') {
    badge = (
      <View style={[styles.badge, { backgroundColor: RedBackground[mode] }]}>
        <ThemedText type="smallBold" style={[styles.badgeText, { color: RedColor[mode] }]}>
          Refusée
        </ThemedText>
      </View>
    );
  } else {
    badge = (
      <View style={[styles.badge, { backgroundColor: TintBackground[mode] }]}>
        <ThemedText type="smallBold" style={[styles.badgeText, { color: colors.tint }]}>
          Soumise
        </ThemedText>
      </View>
    );
  }

  let body = null;
  let action = null;

  if (!submissionsOpen) {
    // Tournoi lancé : plus rien à faire, la carte devient une consultation.
    body = list ? null : (
      <ThemedText type="small" themeColor="textSecondary">
        La soumission est close.
      </ThemedText>
    );
    action = list ? (
      <Pressable style={styles.linkButton} onPress={onOpen} accessibilityRole="button">
        <ThemedText type="smallBold" style={{ color: colors.tint }}>
          Voir ma liste
        </ThemedText>
      </Pressable>
    ) : null;
  } else if (!list) {
    body = (
      <ThemedText type="small">L’organisation attend ta liste avant le jour J.</ThemedText>
    );
    action = (
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
        ]}>
        <ThemedText type="smallBold" style={{ color: OnTint[mode] }}>
          Ajouter ma liste
        </ThemedText>
      </Pressable>
    );
  } else if (list.status === 'approved') {
    body = (
      <View style={styles.approvedRow}>
        <Ionicons name="checkmark-circle" size={18} color={GreenColor[mode]} />
        <ThemedText type="small" style={styles.approvedText}>
          Ta liste est validée. Elle ne peut plus être modifiée.
        </ThemedText>
      </View>
    );
    action = (
      <Pressable style={styles.linkButton} onPress={onOpen} accessibilityRole="button">
        <ThemedText type="smallBold" style={{ color: colors.tint }}>
          Voir ma liste
        </ThemedText>
      </Pressable>
    );
  } else if (list.status === 'rejected') {
    body = (
      <View style={[styles.rejectBox, { backgroundColor: RedBackground[mode] }]}>
        <ThemedText type="smallBold" style={{ color: RedColor[mode] }}>
          Motif du refus
        </ThemedText>
        {/* Le commentaire doit rester lisible même long : couleur de texte normale. */}
        <ThemedText type="small">{list.organizer_comment ?? 'Aucun motif transmis.'}</ThemedText>
      </View>
    );
    action = (
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
        ]}>
        <ThemedText type="smallBold" style={{ color: OnTint[mode] }}>
          Corriger et soumettre à nouveau
        </ThemedText>
      </Pressable>
    );
  } else {
    body = (
      <View style={styles.submittedBody}>
        <ThemedText type="small" themeColor="textSecondary">
          Envoyée le {shortDate(list.submitted_at)}. En attente de relecture par l’organisation.
        </ThemedText>
        {/* Aperçu : la preuve visuelle que « c'est bien ma liste ». */}
        <ThemedText
          numberOfLines={2}
          ellipsizeMode="tail"
          style={[styles.preview, { color: colors.textSecondary }]}>
          {list.content}
        </ThemedText>
      </View>
    );
    action = (
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.backgroundSelected, opacity: pressed ? 0.8 : 1 },
        ]}>
        <ThemedText type="smallBold">Voir ou modifier ma liste</ThemedText>
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            Ma liste d’armée
          </ThemedText>
        </View>
        {badge}
      </View>
      {body}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 16,
  },
  submittedBody: {
    gap: Spacing.one,
  },
  preview: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    lineHeight: 18,
  },
  approvedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.one,
  },
  approvedText: {
    flex: 1,
  },
  rejectBox: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.half,
  },
  button: {
    minHeight: 52,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  linkButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
});
