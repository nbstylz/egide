import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../lib/supabase';
import type { Pairing } from './use-rounds';

/** Les quatre valeurs saisissables d'une table. */
export type Draft = { a: string; b: string; ta: string; tb: string };
/** Champ visé : points du joueur A/B, tactiques du joueur A/B. */
export type Side = 'a' | 'b' | 'ta' | 'tb';

/** Au-delà, c'est presque sûrement une faute de frappe : on refuse la saisie. */
const MaxScore = 200;
/**
 * Barème AOS retenu : 80 points par partie (50 de primaire, 30 de tactiques).
 * Au-delà, on avertit sans bloquer — les formats maison peuvent différer.
 */
export const UsualMaxScore = 80;
/** 6 tactiques sont en jeu ; chaque joueur en choisit 2 cartes de 3. */
export const UsualMaxTactics = 6;

/** Ne garde que des chiffres, dans une borne raisonnable. */
export function sanitizeScore(text: string): string {
  const digits = text.replace(/[^0-9]/g, '').slice(0, 3);
  if (digits === '') return '';
  return Number(digits) > MaxScore ? digits.slice(0, -1) : digits;
}

/** Un seul chiffre : on ne marque pas dix tactiques. */
export function sanitizeTactics(text: string): string {
  return text.replace(/[^0-9]/g, '').slice(0, 1);
}

export type Verdict =
  | { kind: 'none' }
  | { kind: 'draw' }
  | { kind: 'win'; winner: 'a' | 'b'; pseudo: string }
  | { kind: 'missing'; side: 'a' | 'b'; pseudo: string }
  | { kind: 'unusual' };

/** Ce que disent les deux champs de points, avant même l'enregistrement. */
export function verdictFor(pairing: Pairing, draft: Draft, showMissing: boolean): Verdict {
  const hasA = draft.a !== '';
  const hasB = draft.b !== '';

  if (!hasA && !hasB) return { kind: 'none' };
  if (hasA !== hasB) {
    if (!showMissing) return { kind: 'none' };
    return hasA
      ? { kind: 'missing', side: 'b', pseudo: pairing.player_b?.pseudo ?? 'l’adversaire' }
      : { kind: 'missing', side: 'a', pseudo: pairing.player_a?.pseudo ?? 'le joueur' };
  }

  const a = Number(draft.a);
  const b = Number(draft.b);
  if (a > UsualMaxScore || b > UsualMaxScore) return { kind: 'unusual' };
  if (a === b) return { kind: 'draw' };
  return a > b
    ? { kind: 'win', winner: 'a', pseudo: pairing.player_a?.pseudo ?? '' }
    : { kind: 'win', winner: 'b', pseudo: pairing.player_b?.pseudo ?? '' };
}

export type TacticsVerdict =
  | { kind: 'none' }
  | { kind: 'missing'; side: 'ta' | 'tb'; pseudo: string }
  | { kind: 'unusual'; side: 'ta' | 'tb' };

/**
 * Les tactiques sont facultatives, mais solidaires : une seule des deux
 * saisies fausserait le 3e départage.
 */
export function tacticsVerdictFor(
  pairing: Pairing,
  draft: Draft,
  showMissing: boolean
): TacticsVerdict {
  const hasA = draft.ta !== '';
  const hasB = draft.tb !== '';

  if (hasA && Number(draft.ta) > UsualMaxTactics) return { kind: 'unusual', side: 'ta' };
  if (hasB && Number(draft.tb) > UsualMaxTactics) return { kind: 'unusual', side: 'tb' };

  if (!hasA && !hasB) return { kind: 'none' };
  if (hasA !== hasB) {
    if (!showMissing) return { kind: 'none' };
    return hasA
      ? { kind: 'missing', side: 'tb', pseudo: pairing.player_b?.pseudo ?? 'l’adversaire' }
      : { kind: 'missing', side: 'ta', pseudo: pairing.player_a?.pseudo ?? 'le joueur' };
  }
  return { kind: 'none' };
}

/** Une table est saisie dès que ses deux points le sont. */
export function isDraftScored(draft: Draft | undefined): boolean {
  return Boolean(draft && draft.a !== '' && draft.b !== '');
}

/** Les tactiques sont complètes quand les deux sont renseignées. */
export function hasTactics(draft: Draft | undefined): boolean {
  return Boolean(draft && draft.ta !== '' && draft.tb !== '');
}

type Options = {
  pairings: Pairing[];
  editable: boolean;
  onSaved: (pairing: Pairing, previous: Draft, next: Draft, wasFilled: boolean) => void;
  onFailed: (pairing: Pairing, retry: () => void) => void;
};

function draftOf(pairing: Pairing): Draft {
  return {
    a: pairing.score_a === null ? '' : String(pairing.score_a),
    b: pairing.score_b === null ? '' : String(pairing.score_b),
    ta: pairing.tactics_a === null || pairing.tactics_a === undefined ? '' : String(pairing.tactics_a),
    tb: pairing.tactics_b === null || pairing.tactics_b === undefined ? '' : String(pairing.tactics_b),
  };
}

const sameDraft = (x: Draft, y: Draft) =>
  x.a === y.a && x.b === y.b && x.ta === y.ta && x.tb === y.tb;

/**
 * Saisie des scores : brouillons locaux, enregistrement quand une ligne
 * complète perd le focus, et navigation au clavier entre les tables.
 */
export function useScoreEntry({ pairings, editable, onSaved, onFailed }: Options) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  /**
   * Valeurs confirmées par le serveur. C'est cet état, et non un rechargement
   * de la liste, qui met à jour les compteurs : recharger à chaque saisie
   * ferait clignoter le tableau et perdrait le focus au clavier.
   */
  const [saved, setSaved] = useState<Record<string, Draft>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  /** Lignes dont on a quitté le focus : on peut alors signaler un champ manquant. */
  const [touchedIds, setTouchedIds] = useState<Set<string>>(new Set());

  const savedRef = useRef<Record<string, Draft>>({});
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const draftsRef = useRef<Record<string, Draft>>({});
  draftsRef.current = drafts;

  useEffect(() => {
    const next: Record<string, Draft> = {};
    for (const pairing of pairings) {
      next[pairing.id] = draftOf(pairing);
    }
    setDrafts(next);
    setSaved(JSON.parse(JSON.stringify(next)));
    savedRef.current = JSON.parse(JSON.stringify(next));
  }, [pairings]);

  const registerInput = useCallback((key: string, element: HTMLInputElement | null) => {
    if (element) inputRefs.current.set(key, element);
    else inputRefs.current.delete(key);
  }, []);

  const setField = useCallback((pairingId: string, side: Side, value: string) => {
    const clean = side === 'a' || side === 'b' ? sanitizeScore(value) : sanitizeTactics(value);
    setDrafts((current) => ({
      ...current,
      [pairingId]: { ...current[pairingId], [side]: clean },
    }));
  }, []);

  /** Enregistre une ligne si ses points sont complets et que quelque chose a changé. */
  const commit = useCallback(
    async (pairing: Pairing) => {
      if (!supabase || !editable) return;
      const draft = draftsRef.current[pairing.id];
      const saved = savedRef.current[pairing.id];
      if (!draft) return;
      if (!isDraftScored(draft)) return;
      if (saved && sameDraft(saved, draft)) return;

      const previous: Draft = saved ?? { a: '', b: '', ta: '', tb: '' };
      const wasFilled = isDraftScored(previous);

      setBusyIds((current) => new Set(current).add(pairing.id));
      setFailedIds((current) => {
        const copy = new Set(current);
        copy.delete(pairing.id);
        return copy;
      });

      const { error } = await supabase.rpc('set_pairing_score', {
        p_pairing_id: pairing.id,
        p_score_a: Number(draft.a),
        p_score_b: Number(draft.b),
        p_tactics_a: draft.ta === '' ? null : Number(draft.ta),
        p_tactics_b: draft.tb === '' ? null : Number(draft.tb),
      });

      setBusyIds((current) => {
        const copy = new Set(current);
        copy.delete(pairing.id);
        return copy;
      });

      if (error) {
        // Retour aux valeurs confirmées : mieux vaut un champ vide qu'un
        // score que l'organisateur croit enregistré.
        setDrafts((current) => ({ ...current, [pairing.id]: { ...previous } }));
        setFailedIds((current) => new Set(current).add(pairing.id));
        setTimeout(() => {
          setFailedIds((current) => {
            const copy = new Set(current);
            copy.delete(pairing.id);
            return copy;
          });
        }, 4000);
        onFailed(pairing, () => {
          setDrafts((current) => ({ ...current, [pairing.id]: { ...draft } }));
          commit(pairing);
        });
        return;
      }

      savedRef.current[pairing.id] = { ...draft };
      setSaved((current) => ({ ...current, [pairing.id]: { ...draft } }));
      onSaved(pairing, previous, draft, wasFilled);
    },
    [editable, onSaved, onFailed]
  );

  /** Réécrit un résultat connu (sert au « Annuler » d'une correction). */
  const restore = useCallback(async (pairing: Pairing, value: Draft) => {
    if (!supabase) return;
    setDrafts((current) => ({ ...current, [pairing.id]: { ...value } }));
    const { error } = await supabase.rpc('set_pairing_score', {
      p_pairing_id: pairing.id,
      p_score_a: value.a === '' ? null : Number(value.a),
      p_score_b: value.b === '' ? null : Number(value.b),
      p_tactics_a: value.ta === '' ? null : Number(value.ta),
      p_tactics_b: value.tb === '' ? null : Number(value.tb),
    });
    if (!error) {
      savedRef.current[pairing.id] = { ...value };
      setSaved((current) => ({ ...current, [pairing.id]: { ...value } }));
    }
  }, []);

  /** Enregistre toutes les lignes en attente (changement de ronde, départ). */
  const flush = useCallback(async () => {
    for (const pairing of pairings) {
      await commit(pairing);
    }
  }, [pairings, commit]);

  const markTouched = useCallback((pairingId: string) => {
    setTouchedIds((current) => new Set(current).add(pairingId));
  }, []);

  const focusField = useCallback((pairingId: string, side: Side) => {
    const input = inputRefs.current.get(`${pairingId}-${side}`);
    input?.focus();
    input?.select();
  }, []);

  /** Prévient si une saisie complète n'a pas encore été confirmée. */
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      const pending = Object.entries(draftsRef.current).some(([id, draft]) => {
        const saved = savedRef.current[id];
        return isDraftScored(draft) && saved && !sameDraft(saved, draft);
      });
      if (pending) event.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return {
    drafts,
    saved,
    busyIds,
    failedIds,
    touchedIds,
    setField,
    commit,
    restore,
    flush,
    markTouched,
    focusField,
    registerInput,
  };
}
