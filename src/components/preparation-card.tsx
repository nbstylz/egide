import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';

import { FactionPicker } from '@/components/faction-picker';
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

/** Pourquoi la faction ne peut plus changer, quand c'est le cas. */
export type FactionLock = 'list' | 'started' | null;

type Props = {
  list: ArmyList | null;
  /** Vrai tant que le tournoi est « inscriptions ouvertes » : on peut soumettre. */
  submissionsOpen: boolean;
  onOpen: () => void;
  /** Faction déclarée pour ce tournoi, ou null. */
  faction: string | null;
  /** Faction favorite du profil, proposée en raccourci — jamais enregistrée seule. */
  favoriteFaction: string | null;
  factionLock: FactionLock;
  onDeclareFaction: (faction: string) => void;
  factionSaving: boolean;
  factionSaved: boolean;
  factionError: string | null;
  onRetryFaction: () => void;
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
 * « Ma préparation » : ce que le joueur inscrit a à faire avant le jour J.
 *
 * Deux sous-blocs dans une seule carte, et non deux cartes : la fiche empile
 * déjà six à huit blocs, et faction et liste répondent à la même question. La
 * faction vient en premier — on choisit son armée avant d'écrire sa liste.
 *
 * Le statut de la liste se lit au badge ET au texte, jamais à la couleur seule.
 * La saisie de la liste vit dans l'écran dédié : jamais de champ multiligne ici.
 */
export function PreparationCard({
  list,
  submissionsOpen,
  onOpen,
  faction,
  favoriteFaction,
  factionLock,
  onDeclareFaction,
  factionSaving,
  factionSaved,
  factionError,
  onRetryFaction,
}: Props) {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];

  // ---------------------------------------------------------------------
  // Sous-bloc Faction
  // ---------------------------------------------------------------------
  let factionBlock;
  if (factionLock) {
    // Figée : aucun contrôle, aucun bouton grisé. On dit pourquoi, c'est tout.
    factionBlock = (
      <View style={styles.section}>
        <View style={styles.headerLeft}>
          <Ionicons name="shield-outline" size={16} color={colors.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            Faction
          </ThemedText>
        </View>
        <ThemedText type="subtitle">{faction ?? 'Non renseignée'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {factionLock === 'list'
            ? 'Validée avec ta liste d’armée.'
            : 'Le tournoi a commencé : elle ne peut plus changer.'}
        </ThemedText>
      </View>
    );
  } else {
    // Le raccourci n'apparaît que si le profil porte une faction et qu'elle
    // n'est pas déjà celle du tournoi. Un tap l'enregistre — mais un tap, pas
    // un préremplissage : une favorite écrite en douce fabriquerait une
    // statistique fausse (leçon de l'US-9.2).
    const shortcut =
      !faction && favoriteFaction ? (
        <Pressable
          onPress={() => onDeclareFaction(favoriteFaction)}
          disabled={factionSaving}
          accessibilityRole="button"
          accessibilityLabel={`Utiliser ma faction favorite, ${favoriteFaction}`}
          style={styles.linkButton}>
          <ThemedText type="smallBold" style={{ color: colors.tint }}>
            Utiliser ma faction favorite ({favoriteFaction})
          </ThemedText>
        </Pressable>
      ) : null;

    let footer;
    if (factionSaving) {
      footer = (
        <ThemedText type="small" themeColor="textSecondary">
          Enregistrement…
        </ThemedText>
      );
    } else if (factionError) {
      footer = (
        <Pressable onPress={onRetryFaction} accessibilityRole="button" style={styles.linkButton}>
          <ThemedText type="smallBold" style={{ color: colors.tint }}>
            Réessayer
          </ThemedText>
        </Pressable>
      );
    } else if (factionSaved) {
      footer = (
        <View style={styles.savedRow}>
          <Ionicons name="checkmark-circle" size={16} color={GreenColor[mode]} />
          <ThemedText type="smallBold" style={{ color: GreenColor[mode] }}>
            Faction enregistrée
          </ThemedText>
        </View>
      );
    } else {
      footer = null;
    }

    // Le tournoi lancé n'a plus d'inscrits à informer : la phrase change de
    // motif, elle ne parle plus que des statistiques.
    const hint = !submissionsOpen
      ? 'Elle alimente tes statistiques.'
      : faction
        ? 'Visible par les autres inscrits. Modifiable à tout moment.'
        : 'Facultatif. Elle s’affiche à côté de ton pseudo dans la liste des inscrits et alimente tes statistiques.';

    factionBlock = (
      <View style={styles.section}>
        <View style={styles.headerLeft}>
          <Ionicons name="shield-outline" size={16} color={colors.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            Faction
          </ThemedText>
        </View>
        {faction ? null : (
          <ThemedText type="small">Avec quelle faction joues-tu ce tournoi ?</ThemedText>
        )}
        <FactionPicker
          value={faction ?? ''}
          onChange={onDeclareFaction}
          disabled={factionSaving}
          label=""
          error={factionError}
          hint={factionError || factionSaving || factionSaved ? null : hint}
        />
        {shortcut}
        {footer}
      </View>
    );
  }

  // ---------------------------------------------------------------------
  // Sous-bloc Liste d'armée (inchangé depuis l'US-5.1)
  // ---------------------------------------------------------------------
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
    // Tournoi lancé : plus rien à faire, le bloc devient une consultation.
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
      <View style={styles.headerLeft}>
        <Ionicons name="clipboard-outline" size={16} color={colors.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          Ma préparation
        </ThemedText>
      </View>

      {factionBlock}

      <View style={[styles.divider, { backgroundColor: colors.backgroundSelected }]} />

      <View style={styles.section}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  section: {
    gap: Spacing.one,
  },
  divider: {
    height: 1,
    marginHorizontal: -Spacing.three,
    marginVertical: Spacing.half,
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
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
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
