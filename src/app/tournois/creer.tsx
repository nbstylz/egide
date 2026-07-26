import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SegmentedControl } from '@/components/segmented-control';
import { Stepper } from '@/components/stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { useSession } from '@/hooks/use-session';
import { maskDateInput, parseFrenchDate } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

const ErrorColor = { light: '#D14343', dark: '#FF6369' };
const PointsPresets = [1000, 1500, 2000] as const;

export default function CreerTournoiScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const errorColor = ErrorColor[scheme === 'dark' ? 'dark' : 'light'];
  const { session, loading: sessionLoading } = useSession();
  const { profile } = useProfile(session?.user.id);

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [dateText, setDateText] = useState('');
  const [type, setType] = useState('individual');
  const [pointsChip, setPointsChip] = useState<number | 'other'>(2000);
  const [customPoints, setCustomPoints] = useState('');
  const [rounds, setRounds] = useState(5);
  const [capacity, setCapacity] = useState(32);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState(false);
  const [busy, setBusy] = useState(false);

  // Pré-remplit la région avec celle du profil (recommandation UX).
  useEffect(() => {
    if (profile?.region) {
      setRegion((current) => (current === '' ? profile.region! : current));
    }
  }, [profile]);

  const inputStyle = (field: string) => [
    styles.input,
    {
      backgroundColor: colors.backgroundElement,
      color: colors.text,
      borderColor: errors[field] ? errorColor : colors.backgroundSelected,
    },
  ];

  function validate(): { isoDate: string; points: number } | null {
    const nextErrors: Record<string, string> = {};

    if (name.trim().length < 3) nextErrors.name = 'Le nom est obligatoire (3 caractères min.).';
    if (city.trim() === '') nextErrors.city = 'Indique la ville du tournoi.';

    const isoDate = parseFrenchDate(dateText);
    if (!isoDate) {
      nextErrors.date = 'Date invalide (JJ/MM/AAAA).';
    } else if (isoDate < new Date().toISOString().slice(0, 10)) {
      nextErrors.date = 'La date doit être dans le futur.';
    }

    const points = pointsChip === 'other' ? parseInt(customPoints, 10) : pointsChip;
    if (!points || points <= 0) nextErrors.points = 'Indique un nombre de points valide.';

    if (rounds < 1 || rounds > 8) nextErrors.rounds = 'Le nombre de rondes doit être entre 1 et 8.';
    if (capacity < 4 || capacity > 200 || capacity % 2 !== 0) {
      nextErrors.capacity = 'La capacité doit être un nombre pair entre 4 et 200.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !isoDate || !points) return null;
    return { isoDate, points };
  }

  async function handleSubmit() {
    if (!supabase || !session) return;
    const validated = validate();
    if (!validated) return;

    setBusy(true);
    setServerError(false);
    const { error } = await supabase.from('tournaments').insert({
      organizer_id: session.user.id,
      name: name.trim(),
      city: city.trim(),
      region: region.trim() || null,
      event_date: validated.isoDate,
      points_limit: validated.points,
      rounds_count: rounds,
      capacity,
      type,
      status: 'open',
    });
    setBusy(false);

    if (error) {
      setServerError(true);
    } else {
      router.back();
    }
  }

  function renderError(field: string) {
    return errors[field] ? (
      <ThemedText type="small" style={{ color: errorColor }}>
        {errors[field]}
      </ThemedText>
    ) : null;
  }

  let content;
  if (sessionLoading) {
    content = <ActivityIndicator color={colors.tint} style={styles.centered} />;
  } else if (!session) {
    content = (
      <View style={styles.centered}>
        <ThemedText style={styles.centeredText}>
          Connecte-toi pour créer un tournoi.
        </ThemedText>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.replace('/profil')}>
          <ThemedText style={styles.primaryButtonText}>Se connecter</ThemedText>
        </Pressable>
      </View>
    );
  } else {
    content = (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.formContainer}
        keyboardShouldPersistTaps="handled">
        {/* Groupe 1 — Informations */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.groupHeader}>
          Informations
        </ThemedText>

        <View style={styles.field}>
          <ThemedText type="small">Nom du tournoi</ThemedText>
          <TextInput
            style={inputStyle('name')}
            placeholder="Nom du tournoi (ex. Trophée de Lyon)"
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
            maxLength={80}
            editable={!busy}
          />
          {renderError('name')}
        </View>

        <View style={styles.field}>
          <ThemedText type="small">Ville</ThemedText>
          <TextInput
            style={inputStyle('city')}
            placeholder="Ville"
            placeholderTextColor={colors.textSecondary}
            value={city}
            onChangeText={setCity}
            editable={!busy}
          />
          {renderError('city')}
        </View>

        <View style={styles.field}>
          <ThemedText type="small">Région (optionnel)</ThemedText>
          <TextInput
            style={inputStyle('region')}
            placeholder="Région (ex. Auvergne-Rhône-Alpes)"
            placeholderTextColor={colors.textSecondary}
            value={region}
            onChangeText={setRegion}
            editable={!busy}
          />
        </View>

        <View style={styles.field}>
          <ThemedText type="small">Date</ThemedText>
          <TextInput
            style={inputStyle('date')}
            placeholder="JJ/MM/AAAA"
            placeholderTextColor={colors.textSecondary}
            value={dateText}
            onChangeText={(text) => setDateText(maskDateInput(text))}
            keyboardType="number-pad"
            maxLength={10}
            editable={!busy}
          />
          {renderError('date') ?? (
            <ThemedText type="small" themeColor="textSecondary">
              Format : JJ/MM/AAAA
            </ThemedText>
          )}
        </View>

        {/* Groupe 2 — Format */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.groupHeader}>
          Format
        </ThemedText>

        <View style={styles.field}>
          <ThemedText type="small">Type de tournoi</ThemedText>
          <SegmentedControl
            value={type}
            onChange={setType}
            options={[
              { value: 'individual', label: 'Individuel' },
              { value: 'team', label: 'Équipe', disabled: true, badge: 'Bientôt' },
            ]}
          />
        </View>

        <View style={styles.field}>
          <ThemedText type="small">Points de liste</ThemedText>
          <View style={styles.chipRow}>
            {PointsPresets.map((points) => {
              const active = pointsChip === points;
              return (
                <Pressable
                  key={points}
                  disabled={busy}
                  onPress={() => setPointsChip(points)}
                  style={[
                    styles.chip,
                    { backgroundColor: colors.backgroundElement },
                    active && { borderColor: colors.tint, borderWidth: 1 },
                  ]}>
                  <ThemedText
                    type={active ? 'smallBold' : 'small'}
                    style={active ? { color: colors.tint } : null}>
                    {points}
                  </ThemedText>
                </Pressable>
              );
            })}
            <Pressable
              disabled={busy}
              onPress={() => setPointsChip('other')}
              style={[
                styles.chip,
                { backgroundColor: colors.backgroundElement },
                pointsChip === 'other' && { borderColor: colors.tint, borderWidth: 1 },
              ]}>
              <ThemedText
                type={pointsChip === 'other' ? 'smallBold' : 'small'}
                style={pointsChip === 'other' ? { color: colors.tint } : null}>
                Autre
              </ThemedText>
            </Pressable>
          </View>
          {pointsChip === 'other' ? (
            <TextInput
              style={inputStyle('points')}
              placeholder="Points de liste (ex. 1250)"
              placeholderTextColor={colors.textSecondary}
              value={customPoints}
              onChangeText={setCustomPoints}
              keyboardType="number-pad"
              maxLength={5}
              editable={!busy}
            />
          ) : null}
          {renderError('points')}
        </View>

        <View style={styles.field}>
          <ThemedText type="small">Nombre de rondes</ThemedText>
          <Stepper value={rounds} onChange={setRounds} min={1} max={8} disabled={busy} />
          {renderError('rounds')}
        </View>

        {/* Groupe 3 — Capacité */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.groupHeader}>
          Capacité
        </ThemedText>

        <View style={styles.field}>
          <ThemedText type="small">Nombre de joueurs maximum</ThemedText>
          <Stepper value={capacity} onChange={setCapacity} min={4} max={200} step={2} disabled={busy} />
          {renderError('capacity') ?? (
            <ThemedText type="small" themeColor="textSecondary">
              Un nombre pair évite les rondes avec exempt (bye).
            </ThemedText>
          )}
        </View>

        {serverError ? (
          <View style={[styles.serverError, { backgroundColor: 'rgba(209,67,67,0.10)' }]}>
            <ThemedText type="small" style={{ color: errorColor }}>
              Impossible de créer le tournoi. Vérifie ta connexion et réessaie.
            </ThemedText>
          </View>
        ) : null}

        <Pressable
          disabled={busy}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={handleSubmit}>
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <ThemedText style={styles.primaryButtonText}>Créer le tournoi</ThemedText>
          )}
        </Pressable>
        <Pressable
          disabled={busy}
          style={({ pressed }) => [
            styles.secondaryButton,
            { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.back()}>
          <ThemedText>Annuler</ThemedText>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* En-tête avec bouton retour */}
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityLabel="Retour">
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <ThemedText type="default" style={styles.headerTitle}>
            Créer un tournoi
          </ThemedText>
        </View>
        {content}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -Spacing.two,
  },
  headerTitle: {
    fontWeight: '700',
    fontSize: 20,
  },
  scroll: {
    flex: 1,
  },
  formContainer: {
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  groupHeader: {
    textTransform: 'uppercase',
    marginTop: Spacing.two,
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  chip: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serverError: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  primaryButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    alignSelf: 'stretch',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  centeredText: {
    textAlign: 'center',
  },
});
