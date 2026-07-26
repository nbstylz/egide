import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import type { TournamentWithCount } from '@/hooks/use-tournaments';
import { EmptyFilters, regionKey, type EventFilters } from '@/lib/event-filters';

const StorageKey = 'egide.events.filters.v1';

/**
 * État des filtres de l'annuaire, conservé d'une visite à l'autre.
 *
 * Seules les préférences stables sont enregistrées (régions, formats, type) :
 * la période repart toujours de « À venir », car un « ce mois-ci » ou une date
 * enregistrés deviennent faux avec le temps et videraient la liste sans raison
 * compréhensible.
 */
export function useEventFilters(events: TournamentWithCount[]) {
  const [filters, setFilters] = useState<EventFilters>(EmptyFilters);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(StorageKey)
      .then((raw) => {
        if (raw) {
          const saved = JSON.parse(raw) as Partial<EventFilters>;
          setFilters({
            ...EmptyFilters,
            regions: Array.isArray(saved.regions) ? saved.regions : [],
            points: Array.isArray(saved.points) ? saved.points : [],
            type: saved.type === 'individual' || saved.type === 'team' ? saved.type : 'all',
          });
        }
      })
      // Stockage illisible ou corrompu : on démarre sans filtre, sans le dire.
      .catch(() => {})
      .finally(() => setRestored(true));
  }, []);

  // Une région ou un format enregistrés qui n'existent plus dans les
  // événements seraient des filtres fantômes : on les retire en silence.
  useEffect(() => {
    if (!restored || events.length === 0) return;
    const knownRegions = new Set(events.map((event) => regionKey(event.region)));
    const knownPoints = new Set(events.map((event) => event.points_limit));
    setFilters((current) => {
      const regions = current.regions.filter((key) => knownRegions.has(key));
      const points = current.points.filter((value) => knownPoints.has(value));
      if (regions.length === current.regions.length && points.length === current.points.length) {
        return current;
      }
      return { ...current, regions, points };
    });
  }, [restored, events]);

  /** Enregistre les préférences durables (appelé à la fermeture de la modale). */
  const persist = useCallback((value: EventFilters) => {
    AsyncStorage.setItem(
      StorageKey,
      JSON.stringify({ regions: value.regions, points: value.points, type: value.type })
    ).catch(() => {});
  }, []);

  const reset = useCallback(() => {
    setFilters(EmptyFilters);
    persist(EmptyFilters);
  }, [persist]);

  return { filters, setFilters, persist, reset };
}
