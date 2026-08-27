import { useState } from 'react';

import { useFactions } from '../hooks/use-factions';
import { supabase } from '../lib/supabase';

type Props = {
  registrationId: string;
  /** Faction actuellement enregistrée, ou null. */
  faction: string | null;
  /** Faux quand la lecture seule s'impose : on rend alors du texte, pas un champ grisé. */
  editable: boolean;
  /** Remonte la valeur acceptée pour que le tableau la garde sans rechargement. */
  onSaved: (faction: string | null) => void;
  onError: (message: string) => void;
};

/**
 * La faction d'un inscrit, corrigeable par l'organisateur (US-9.4).
 *
 * Le cas qui a motivé cette cellule : un joueur inscrit la veille, qui ne
 * déclare rien et arrive le matin. Sans elle son trou ne se comble jamais —
 * « combler oui, réécrire non » lui interdit d'y revenir une fois le tournoi
 * lancé. L'organisateur, lui, a l'armée sous les yeux.
 *
 * Enregistrement immédiat au choix, sans bouton : c'est une cellule de tableau,
 * pas un formulaire. Et **aucun rechargement de la liste** après écriture — la
 * page Inscrits recrée alors ses lignes, ce qui fait clignoter le tableau et
 * perdre la place. Même leçon que la saisie des scores.
 */
export function FactionCell({ registrationId, faction, editable, onSaved, onError }: Props) {
  const { groups } = useFactions();
  const [saving, setSaving] = useState(false);

  if (!editable) {
    return <>{faction ?? '—'}</>;
  }

  async function change(value: string) {
    if (!supabase) return;
    const next = value === '' ? null : value;
    setSaving(true);
    const { error } = await supabase.rpc('set_faction_as_organizer', {
      p_registration_id: registrationId,
      p_faction: next,
    });
    setSaving(false);
    if (error) {
      onError(
        error.message === 'TOURNAMENT_CLOSED'
          ? 'Ce tournoi est terminé : une faction déjà renseignée ne se corrige plus.'
          : 'Impossible d’enregistrer cette faction. Réessaie.'
      );
      return;
    }
    onSaved(next);
  }

  return (
    <select
      className="faction-select"
      value={faction ?? ''}
      disabled={saving}
      aria-label="Faction du joueur"
      onChange={(event) => change(event.target.value)}>
      <option value="">— non renseignée —</option>
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.factions.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
