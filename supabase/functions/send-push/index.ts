// Edge Function « send-push » : l'unique porte de sortie des notifications.
//
// Trois modes :
//  • { test: true } — un utilisateur connecté s'envoie une notification de
//    test sur ses propres appareils (US-6.1) ;
//  • { flush: true } — vide la file `push_outbox` et compose les messages
//    (US-6.2 à 6.4). N'importe quel utilisateur connecté peut le demander :
//    le contenu vient de la base, jamais de l'appelant — vider tôt ou tard
//    ne change que le délai de livraison ;
//  • { profile_ids, title, body } — envoi ciblé, réservé à la clé service.
//
// Les jetons signalés « DeviceNotRegistered » par Expo sont supprimés.

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

type Payload = {
  test?: boolean;
  flush?: boolean;
  profile_ids?: string[];
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
};

type Message = {
  profile_id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
};

const ExpoPushUrl = 'https://exp.host/--/api/v2/push/send';

// Les appels viennent aussi des navigateurs (back office, web) : sans ces
// en-têtes, le prévol CORS échoue avant même d'atteindre la fonction.
const CorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(bodyValue: unknown, status = 200): Response {
  return new Response(JSON.stringify(bodyValue), {
    status,
    headers: { ...CorsHeaders, 'Content-Type': 'application/json' },
  });
}

/** « samedi 5 décembre » à partir d'une date ISO. */
function frDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** Compose les messages d'un événement de la file. */
async function compose(
  admin: SupabaseClient,
  kind: string,
  payload: Record<string, string>
): Promise<Message[]> {
  if (kind === 'round_published') {
    const { data: round } = await admin
      .from('rounds')
      .select('number, tournament_id, tournament:tournaments(name)')
      .eq('id', payload.round_id)
      .maybeSingle();
    if (!round) return [];
    const { data: pairings } = await admin
      .from('pairings')
      .select(
        'table_number, player_a_id, player_b_id, player_a:profiles!pairings_player_a_id_fkey(pseudo), player_b:profiles!pairings_player_b_id_fkey(pseudo)'
      )
      .eq('round_id', payload.round_id);
    const title = (round.tournament as { name: string } | null)?.name ?? 'EGIDE';
    const url = `/evenements/${round.tournament_id}/tables`;
    const messages: Message[] = [];
    for (const p of pairings ?? []) {
      if (p.player_b_id === null) {
        messages.push({
          profile_id: p.player_a_id,
          title,
          body: `Ronde ${round.number} : tu as le bye (victoire 15 – 5).`,
          data: { url },
        });
        continue;
      }
      const pseudoA = (p.player_a as { pseudo: string } | null)?.pseudo ?? '—';
      const pseudoB = (p.player_b as { pseudo: string } | null)?.pseudo ?? '—';
      messages.push({
        profile_id: p.player_a_id,
        title,
        body: `Ronde ${round.number} : table ${p.table_number}, contre ${pseudoB}.`,
        data: { url },
      });
      messages.push({
        profile_id: p.player_b_id,
        title,
        body: `Ronde ${round.number} : table ${p.table_number}, contre ${pseudoA}.`,
        data: { url },
      });
    }
    return messages;
  }

  if (kind === 'promoted') {
    const { data: reg } = await admin
      .from('registrations')
      .select('player_id, tournament_id, tournament:tournaments(name)')
      .eq('id', payload.registration_id)
      .maybeSingle();
    if (!reg) return [];
    const name = (reg.tournament as { name: string } | null)?.name ?? 'ton tournoi';
    return [
      {
        profile_id: reg.player_id,
        title: name,
        body: 'Une place s’est libérée : ta place est confirmée !',
        data: { url: `/evenements/${reg.tournament_id}` },
      },
    ];
  }

  if (kind === 'list_reviewed') {
    const { data: list } = await admin
      .from('army_lists')
      .select(
        'registration:registrations(player_id, tournament_id, tournament:tournaments(name))'
      )
      .eq('id', payload.list_id)
      .maybeSingle();
    const reg = list?.registration as
      | { player_id: string; tournament_id: string; tournament: { name: string } | null }
      | null;
    if (!reg) return [];
    const name = reg.tournament?.name ?? 'ton tournoi';
    return [
      {
        profile_id: reg.player_id,
        title: name,
        body:
          payload.status === 'approved'
            ? 'Ta liste d’armée est validée.'
            : 'Ta liste d’armée a été refusée — le motif t’attend dans l’app.',
        data: { url: `/evenements/${reg.tournament_id}/liste` },
      },
    ];
  }

  if (kind === 'new_registration') {
    const { data: reg } = await admin
      .from('registrations')
      .select(
        'player_id, status, tournament:tournaments(id, name, organizer_id), profile:profiles(pseudo)'
      )
      .eq('id', payload.registration_id)
      .maybeSingle();
    const t = reg?.tournament as { id: string; name: string; organizer_id: string } | null;
    if (!reg || !t || t.organizer_id === reg.player_id) return [];
    const { data: orga } = await admin
      .from('profiles')
      .select('notify_registrations')
      .eq('id', t.organizer_id)
      .maybeSingle();
    if (!orga?.notify_registrations) return [];
    const pseudo = (reg.profile as { pseudo: string } | null)?.pseudo ?? 'Quelqu’un';
    return [
      {
        profile_id: t.organizer_id,
        title: t.name,
        body:
          reg.status === 'waitlisted'
            ? `${pseudo} rejoint la liste d’attente.`
            : `Nouvelle inscription : ${pseudo}.`,
        data: { url: `/evenements/${t.id}` },
      },
    ];
  }

  if (kind === 'tournament_published') {
    const { data: t } = await admin
      .from('tournaments')
      .select('id, name, city, region, event_date, organizer_id')
      .eq('id', payload.tournament_id)
      .maybeSingle();
    if (!t || !t.region) return [];
    const { data: locals } = await admin
      .from('profiles')
      .select('id')
      .eq('region', t.region)
      .eq('notify_region', true)
      .neq('id', t.organizer_id);
    return (locals ?? []).map((p: { id: string }) => ({
      profile_id: p.id,
      title: 'Nouveau tournoi près de chez toi',
      body: `${t.name} à ${t.city}, le ${frDate(t.event_date)}.`,
      data: { url: `/evenements/${t.id}` },
    }));
  }

  if (kind === 'tournament_reminder') {
    const { data: t } = await admin
      .from('tournaments')
      .select('id, name, city, event_date')
      .eq('id', payload.tournament_id)
      .maybeSingle();
    if (!t) return [];
    // Un rappel par joueur encore inscrit (le check-in a lieu le jour J).
    const { data: regs } = await admin
      .from('registrations')
      .select('player_id')
      .eq('tournament_id', payload.tournament_id)
      .in('status', ['registered', 'checked_in']);
    const url = `/evenements/${t.id}`;
    return (regs ?? []).map((r: { player_id: string }) => ({
      profile_id: r.player_id,
      title: t.name,
      body: `C’est demain ! Rendez-vous à ${t.city}, le ${frDate(t.event_date)}.`,
      data: { url },
    }));
  }

  if (kind === 'tournament_cancelled') {
    const { data: t } = await admin
      .from('tournaments')
      .select('id, name, city, event_date, organizer_id')
      .eq('id', payload.tournament_id)
      .maybeSingle();
    if (!t) return [];

    // Le motif vient de la file : `tournaments` ne le stocke pas, et le
    // journal d'audit n'est pas fait pour être relu à chaque envoi.
    const reason = (payload.reason ?? '').trim();
    // Une notification tronquée par le système ne dit plus rien : on garde
    // le motif court, le détail reste dans l'app.
    const short = reason.length > 90 ? `${reason.slice(0, 89)}…` : reason;
    const url = `/evenements/${t.id}`;

    // Toute inscription encore vivante compte, liste d'attente comprise :
    // une place espérée qui disparaît est aussi une nouvelle à annoncer.
    const { data: regs } = await admin
      .from('registrations')
      .select('player_id')
      .eq('tournament_id', payload.tournament_id)
      .in('status', ['registered', 'checked_in', 'waitlisted']);

    const messages: Message[] = [];
    // L'organisateur d'abord : c'est son événement qu'on retire.
    messages.push({
      profile_id: t.organizer_id,
      title: t.name,
      body: `Ton tournoi a été annulé par l’administration d’EGIDE. Motif : ${short}`,
      data: { url },
    });
    for (const r of (regs ?? []) as { player_id: string }[]) {
      if (r.player_id === t.organizer_id) continue;
      messages.push({
        profile_id: r.player_id,
        title: t.name,
        body: `Ce tournoi du ${frDate(t.event_date)} à ${t.city} a été annulé. Motif : ${short}`,
        data: { url },
      });
    }
    return messages;
  }

  return [];
}

/** Envoie les messages via Expo Push et purge les jetons morts. */
async function deliver(admin: SupabaseClient, messages: Message[]): Promise<number> {
  if (messages.length === 0) return 0;
  const ids = [...new Set(messages.map((m) => m.profile_id))];
  const { data: tokens } = await admin
    .from('push_tokens')
    .select('profile_id, token')
    .in('profile_id', ids);
  const byProfile = new Map<string, string[]>();
  for (const row of (tokens ?? []) as { profile_id: string; token: string }[]) {
    byProfile.set(row.profile_id, [...(byProfile.get(row.profile_id) ?? []), row.token]);
  }

  const pushes = messages.flatMap((m) =>
    (byProfile.get(m.profile_id) ?? []).map((token) => ({
      to: token,
      title: m.title,
      body: m.body,
      data: m.data,
    }))
  );

  let sent = 0;
  const dead: string[] = [];
  for (let i = 0; i < pushes.length; i += 100) {
    const batch = pushes.slice(i, i + 100);
    const response = await fetch(ExpoPushUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
    const result = await response.json();
    const tickets = (result.data ?? []) as { status: string; details?: { error?: string } }[];
    tickets.forEach((ticket, index) => {
      if (ticket.status === 'ok') sent += 1;
      else if (ticket.details?.error === 'DeviceNotRegistered') dead.push(batch[index].to);
    });
  }
  if (dead.length > 0) {
    await admin.from('push_tokens').delete().in('token', dead);
  }
  return sent;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CorsHeaders });
  }

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const admin = createClient(supabaseUrl, serviceKey);

  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const isService = bearer === serviceKey;

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  // Test : uniquement vers soi-même, identité tirée du JWT.
  if (payload.test) {
    const { data: userData, error } = await admin.auth.getUser(bearer);
    if (error || !userData.user) {
      return json({ error: 'UNAUTHORIZED' }, 401);
    }
    const sent = await deliver(admin, [
      {
        profile_id: userData.user.id,
        title: 'EGIDE — test',
        body: 'Les notifications fonctionnent sur cet appareil.',
        data: {},
      },
    ]);
    return json({ sent });
  }

  // Vidage de la file : tout utilisateur connecté (le JWT est déjà vérifié
  // par la passerelle). 20 événements par appel, les suivants attendront.
  if (payload.flush) {
    const { data: events } = await admin
      .from('push_outbox')
      .select('id, kind, payload')
      .order('created_at')
      .limit(20);
    let sent = 0;
    for (const event of (events ?? []) as {
      id: string;
      kind: string;
      payload: Record<string, string>;
    }[]) {
      const messages = await compose(admin, event.kind, event.payload);
      sent += await deliver(admin, messages);
      await admin.from('push_outbox').delete().eq('id', event.id);
    }
    return json({ sent, processed: (events ?? []).length });
  }

  // Envoi ciblé : clé service exigée, jamais un JWT utilisateur.
  if (!isService) {
    return json({ error: 'FORBIDDEN' }, 403);
  }
  const sent = await deliver(
    admin,
    (payload.profile_ids ?? []).map((id) => ({
      profile_id: id,
      title: payload.title ?? 'EGIDE',
      body: payload.body ?? '',
      data: payload.data ?? {},
    }))
  );
  return json({ sent });
});
