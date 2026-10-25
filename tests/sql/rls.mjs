// Test migracji v2–v8 na PGlite z atrapą Supabase (auth, storage, role).
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const REPO = process.argv[2] ?? new URL("../..", import.meta.url).pathname;
const v23 = readFileSync(`${REPO}/supabase/migrations/20261001000003_v2_v3_all.sql`, "utf8").replace(
  /create extension if not exists pgcrypto;/g,
  "",
);
const v4 = readFileSync(`${REPO}/supabase/migrations/20261001000004_v4_team_timeline.sql`, "utf8");
const v5 = readFileSync(`${REPO}/supabase/migrations/20261001000005_v5_company_data.sql`, "utf8");
const v6 = readFileSync(`${REPO}/supabase/migrations/20261001000006_v6_roles_contracts.sql`, "utf8");
const v7 = readFileSync(`${REPO}/supabase/migrations/20261001000007_v7_partner_types.sql`, "utf8");
const v8 = readFileSync(`${REPO}/supabase/migrations/20261025000008_v8_quality_care.sql`, "utf8");

const stub = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (
  id uuid primary key,
  email varchar(255),
  created_at timestamptz default now(),
  raw_user_meta_data jsonb default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text, owner uuid, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
`;

const db = new PGlite();
let failures = 0;
let passes = 0;
function ok(cond, label) {
  if (cond) {
    passes++;
    console.log("  ok   " + label);
  } else {
    failures++;
    console.log("  FAIL " + label);
  }
}

const A = { id: "aaaaaaaa-0000-4000-8000-000000000001", email: "kuba@lutra.pl", name: "Kuba" };
const B = { id: "bbbbbbbb-0000-4000-8000-000000000002", email: "ola@lutra.pl", name: "Ola" };
const C = { id: "cccccccc-0000-4000-8000-000000000003", email: "obcy@example.com", name: "Obcy" };
const D = { id: "dddddddd-0000-4000-8000-000000000004", email: "nowy@lutra.pl", name: "Nowy" };
const E = { id: "eeeeeeee-0000-4000-8000-000000000005", email: "szef@inna.pl", name: "Szef" };
const F = { id: "ffffffff-0000-4000-8000-000000000006", email: "pracownik@inna.pl", name: "Pracownik" };

async function as(user, fn) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    user
      ? JSON.stringify({ sub: user.id, email: user.email, role: "authenticated", user_metadata: { full_name: user.name } })
      : JSON.stringify({ role: "anon" }),
  ]);
  await db.exec(user ? "set role authenticated" : "set role anon");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

async function expectError(label, fn, pattern) {
  try {
    await fn();
    ok(false, `${label} (brak błędu)`);
  } catch (err) {
    const msg = String(err?.message ?? err);
    ok(pattern ? pattern.test(msg) : true, `${label} → ${msg.split("\n")[0]}`);
  }
}

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (sql, params = []) => (await db.query(sql, params)).rows;

console.log("1) Schemat bazowy v2+v3");
await db.exec(stub);
await db.exec(v23);
await db.query(
  `insert into auth.users (id, email, created_at) values
   ($1, $2, now() - interval '30 days'), ($3, $4, now() - interval '20 days'),
   ($5, $6, now() - interval '10 days'), ($7, $8, now() - interval '1 day'),
   ($9, $10, now() - interval '9 days'), ($11, $12, now() - interval '8 days')`,
  [A.id, A.email, B.id, B.email, C.id, C.email, D.id, D.email, E.id, E.email, F.id, F.email],
);

// Stan sprzed migracji: A i B mają osobne workspace (stara ensure_workspace -> seller).
const wsA = await as(A, async () => (await one("select public.ensure_workspace() as ws")).ws);
const wsB = await as(B, async () => (await one("select public.ensure_workspace() as ws")).ws);
ok(wsA && wsB && wsA !== wsB, "A i B mają osobne workspace przed v4");
const bPartner = await as(B, async () =>
  (await one("insert into partners (workspace_id, name) values ($1, 'Bistro Oli') returning id", [wsB])).id,
);
const bMission = await as(B, async () =>
  (await one("insert into missions (workspace_id, partner_id, owner_user_id) values ($1, $2, $3) returning id", [wsB, bPartner, B.id])).id,
);
await as(B, () => db.query("insert into tasks (workspace_id, mission_id, title) values ($1, $2, 'Zadzwoń')", [wsB, bMission]));
const oldConvo = await as(B, async () =>
  (await one("insert into conversations (mission_id, channel, summary_human) values ($1, 'phone', 'stara notatka') returning id", [bMission])).id,
);

console.log("2) Migracja v4 (dwa razy, idempotencja)");
await db.exec(v4);
await db.exec(v4);
ok(true, "v4 przechodzi dwa razy bez błędu");

const roles = await all("select id, role from profiles order by id");
ok(roles.find((r) => r.id === A.id)?.role === "admin", "A awansowany na admin");
ok(roles.find((r) => r.id === B.id)?.role === "admin", "B admin własnego workspace");
const backfill = await all("select kind, to_value from mission_events where mission_id = $1", [bMission]);
ok(backfill.length === 1 && backfill[0].kind === "created", "stara misja dostała wpis 'created' (backfill, bez duplikatu po 2. Run)");
const oldRow = await one("select direction, outcome from conversations where id = $1", [oldConvo]);
ok(oldRow.direction === "outbound" && oldRow.outcome === null, "stara rozmowa: direction=outbound, outcome=null");

console.log("3) Misja i historia etapów");
const pA = await as(A, async () => (await one("insert into partners (workspace_id, name) values ($1, 'Kawiarnia Nova') returning id", [wsA])).id);
const mA = await as(A, async () =>
  (await one(
    `insert into missions (id, workspace_id, partner_id, owner_user_id) values (gen_random_uuid(), $1, $2, $3)
     on conflict (id) do update set current_stage = excluded.current_stage returning id`,
    [wsA, pA, A.id],
  )).id,
);
await as(A, () => db.query("update missions set current_stage = 'contact' where id = $1", [mA]));
await as(A, () =>
  db.query(
    `insert into missions (id, workspace_id, partner_id, owner_user_id, current_stage, status, loss_reason)
     values ($1, $2, $3, $4, 'contact', 'lost', 'Decydent odmówił')
     on conflict (id) do update set current_stage = excluded.current_stage, status = excluded.status, loss_reason = excluded.loss_reason`,
    [mA, wsA, pA, A.id],
  ),
);
await as(A, () =>
  db.query(
    `insert into missions (id, workspace_id, partner_id, owner_user_id, current_stage, status, loss_reason)
     values ($1, $2, $3, $4, 'contact', 'lost', 'Decydent odmówił')
     on conflict (id) do update set current_stage = excluded.current_stage, status = excluded.status, loss_reason = excluded.loss_reason`,
    [mA, wsA, pA, A.id],
  ),
);
const ev = await as(A, () => all("select kind, from_value, to_value, note, actor_id from mission_events where mission_id = $1 order by created_at, kind", [mA]));
ok(ev.length === 3, `3 zdarzenia (created, stage, status) — jest ${ev.length}`);
ok(ev.some((e) => e.kind === "stage" && e.from_value === "research" && e.to_value === "contact"), "stage research→contact");
ok(ev.some((e) => e.kind === "status" && e.to_value === "lost" && e.note === "Decydent odmówił" && e.actor_id === A.id), "status → lost z powodem i autorem");
await expectError("handlowiec nie wpisze zdarzenia ręcznie", () =>
  as(A, () => db.query("insert into mission_events (mission_id, kind) values ($1, 'stage')", [mA])), /permission denied/);

console.log("4) Dziennik kontaktów");
const convo = await as(A, async () =>
  one(
    `insert into conversations (mission_id, channel, direction, outcome, subject, summary_human, duration_min)
     values ($1, 'email', 'inbound', 'replied', 'Re: Lutra', 'Odpisała, że w czwartek', null) returning id, created_by`,
    [mA],
  ),
);
ok(convo.created_by === A.id, "created_by = auth.uid() domyślnie");
await expectError("zły wynik odrzucony", () =>
  as(A, () => db.query("insert into conversations (mission_id, channel, outcome) values ($1, 'phone', 'maybe')", [mA])), /check constraint/);
await expectError("zły kierunek odrzucony", () =>
  as(A, () => db.query("insert into conversations (mission_id, channel, direction) values ($1, 'phone', 'sideways')", [mA])), /check constraint/);

console.log("5) Zaproszenia");
const tokenB = await as(A, async () => (await one("select public.create_workspace_invite($1) as t", ["Ola@Lutra.pl"])).t);
ok(/^[0-9a-f]{64}$/.test(tokenB), "token 64 hex");
const stored = await one("select token_hash, email from workspace_invites");
ok(stored.token_hash !== tokenB && stored.email === "ola@lutra.pl", "w bazie tylko skrót, e-mail znormalizowany");
await expectError("handlowiec nie czyta tabeli zaproszeń", () => as(A, () => db.query("select * from workspace_invites")), /permission denied/);
const listed = await as(A, () => all("select * from public.list_workspace_invites()"));
ok(listed.length === 1 && listed[0].email === "ola@lutra.pl" && listed[0].created_by_name, "lista zaproszeń dla admina");
await expectError("obcy z innym mailem nie dołączy", () => as(C, () => db.query("select public.accept_workspace_invite($1)", [tokenB])), /inny adres/);
await expectError("zły token", () => as(B, () => db.query("select public.accept_workspace_invite($1)", ["x".repeat(64)])), /nie istnieje/);
await expectError("anon nie wywoła funkcji", () => as(null, () => db.query("select public.create_workspace_invite(null)")), /permission denied/);

const peekB = await as(B, () => one("select * from public.peek_workspace_invite($1)", [tokenB]));
ok(
  peekB.status === "ok" && peekB.invited_by === "Kuba" && peekB.alone === true && peekB.own_partners === 1 && peekB.own_missions === 1,
  `podgląd zaproszenia: ${JSON.stringify(peekB)}`,
);
const peekMissing = await as(B, () => one("select status from public.peek_workspace_invite($1)", ["x".repeat(64)]));
ok(peekMissing.status === "missing", "podgląd złego kodu: missing");
const peekC = await as(C, () => one("select status from public.peek_workspace_invite($1)", [tokenB]));
ok(peekC.status === "email_mismatch", "podgląd dla innego maila: email_mismatch");
const peekOwn = await as(A, () => one("select status from public.peek_workspace_invite($1)", [tokenB]));
ok(peekOwn.status === "same_workspace", "admin podgląda własny link: same_workspace (nie zużywa go)");
const joined = await as(B, async () => (await one("select public.accept_workspace_invite($1) as ws", [`  ${tokenB} `])).ws);
ok(joined === wsA, "B dołącza do workspace A");
const bProfile = await one("select workspace_id, role from profiles where id = $1", [B.id]);
ok(bProfile.workspace_id === wsA && bProfile.role === "seller", "B: workspace A, rola seller");
const moved = await one("select (select workspace_id from partners where id = $1) p, (select workspace_id from missions where id = $2) m, (select workspace_id from tasks where mission_id = $2) t", [bPartner, bMission]);
ok(moved.p === wsA && moved.m === wsA && moved.t === wsA, "dane B przeniesione do zespołu");
const seenByB = await as(B, () => all("select name from partners order by name"));
ok(seenByB.length === 2, `B widzi partnerów zespołu (${seenByB.map((r) => r.name).join(", ")})`);
const membersB = await as(B, () => all("select * from public.workspace_members()"));
ok(membersB.length === 2 && membersB.some((m) => m.email === A.email) && membersB.some((m) => m.is_me && m.id === B.id), "lista członków z e-mailami");
const profilesB = await as(B, () => all("select id from profiles"));
ok(profilesB.length === 2, "B widzi profile zespołu");
const again = await as(B, async () => (await one("select public.accept_workspace_invite($1) as ws", [tokenB])).ws);
ok((await as(B, () => one("select status from public.peek_workspace_invite($1)", [tokenB]))).status === "accepted", "podgląd po dołączeniu: accepted");
ok(again === wsA, "ponowne użycie przez tę samą osobę = bez błędu");
await expectError("seller nie zaprasza", () => as(B, () => db.query("select public.create_workspace_invite(null)")), /administrator/);
await expectError("seller nie usuwa", () => as(B, () => db.query("select public.remove_workspace_member($1)", [A.id])), /administrator/);
await expectError("B nie zmieni sobie workspace ręcznie", async () => {
  const res = await as(B, () => db.query("update profiles set workspace_id = $1 where id = $2", [wsB, B.id]));
  if ((res.affectedRows ?? 0) === 0) throw new Error("0 rows (RLS)");
}, /0 rows|permission denied/);

console.log("6) Obcy bez zaproszenia");
await expectError("C nie użyje cudzego, zużytego zaproszenia", () => as(C, () => db.query("select public.accept_workspace_invite($1)", [tokenB])), /już użyte/);
await as(C, () => db.query("select public.ensure_workspace()"));
const cRole = await one("select role from profiles where id = $1", [C.id]);
ok(cRole.role === "admin", "nowy workspace po v4 → założyciel jest adminem");
const seenByC = await as(C, () => all("select id from partners"));
ok(seenByC.length === 0, "C nie widzi danych zespołu");
const evC = await as(C, () => all("select id from mission_events"));
ok(evC.length === 0, "C nie widzi historii zespołu");

console.log("7) Zaproszenie bez e-maila, nowa osoba bez profilu, usunięcie członka");
const tokenD = await as(A, async () => (await one("select public.create_workspace_invite(null) as t")).t);
const joinedD = await as(D, async () => (await one("select public.accept_workspace_invite($1) as ws", [tokenD])).ws);
ok(joinedD === wsA, "D (bez profilu) dołącza od razu do zespołu");
const dProfile = await one("select full_name, role from profiles where id = $1", [D.id]);
ok(dProfile.full_name === "Nowy" && dProfile.role === "seller", "profil D z imieniem z metadanych");
const wsD = await as(D, async () => (await one("select public.ensure_workspace() as ws")).ws);
ok(wsD === wsA, "ensure_workspace po dołączeniu zwraca workspace zespołu");
await expectError("admin nie usunie siebie", () => as(A, () => db.query("select public.remove_workspace_member($1)", [A.id])), /samego siebie/);
await as(A, () => db.query("select public.remove_workspace_member($1)", [D.id]));
const dAfter = await one("select workspace_id, role from profiles where id = $1", [D.id]);
ok(dAfter.workspace_id !== wsA && dAfter.role === "admin", "D przeniesiony do nowego, pustego workspace");
const seenByD = await as(D, () => all("select id from partners"));
ok(seenByD.length === 0, "D po usunięciu nie widzi partnerów zespołu");

console.log("8) Cofnięte i przeterminowane zaproszenia");
const tokenR = await as(A, async () => (await one("select public.create_workspace_invite(null) as t")).t);
const inviteR = (await as(A, () => all("select * from public.list_workspace_invites()")))[0];
await as(A, () => db.query("select public.revoke_workspace_invite($1)", [inviteR.id]));
ok((await as(A, () => all("select * from public.list_workspace_invites()"))).length === 0, "cofnięte znika z listy");
await expectError("cofnięte nie działa", () => as(C, () => db.query("select public.accept_workspace_invite($1)", [tokenR])), /cofnięte/);
const tokenE = await as(A, async () => (await one("select public.create_workspace_invite(null) as t")).t);
await db.query("update workspace_invites set expires_at = now() - interval '1 minute' where accepted_at is null and revoked_at is null");
await expectError("przeterminowane nie działa", () => as(C, () => db.query("select public.accept_workspace_invite($1)", [tokenE])), /wygasło/);
await expectError("zły e-mail w zaproszeniu", () => as(A, () => db.query("select public.create_workspace_invite('nie-mail')")), /Niepoprawny/);

console.log("9) Nazwa workspace");
await as(A, () => db.query("select public.rename_workspace('Zespół Lutra')"));
const wsName = await as(B, async () => (await one("select name from workspaces")).name);
ok(wsName === "Zespół Lutra", "B widzi nową nazwę");
await expectError("seller nie zmienia nazwy", () => as(B, () => db.query("select public.rename_workspace('X Y')")), /administrator/);

console.log("10) Pliki: dostęp za misją");
const convA = (await one("select id from conversations where mission_id = $1 limit 1", [mA])).id;
await db.query("insert into contracts (mission_id, document_path) values ($1, $2)", [mA, `${A.id}/${mA}.pdf`]);
await db.query("insert into recordings (conversation_id, storage_path) values ($1, $2)", [convA, `${A.id}/x.webm`]);
await db.query(
  "insert into storage.objects (bucket_id, name, owner) values ('contracts', $1, $2), ('recordings', $3, $2), ('contracts', $4, $5)",
  [`${A.id}/${mA}.pdf`, A.id, `${A.id}/x.webm`, `${B.id}/szkic.pdf`, B.id],
);
const filesB = await as(B, () => all("select name from storage.objects order by name"));
ok(filesB.length === 3, `B czyta umowę i nagranie misji zespołu + swój szkic (${filesB.length})`);
const filesA = await as(A, () => all("select name from storage.objects where bucket_id = 'contracts'"));
ok(filesA.length === 1, "A nie widzi cudzego, niepodpiętego szkicu");
const filesC = await as(C, () => all("select bucket_id from storage.objects"));
ok(filesC.length === 0, "C nie czyta plików zespołu");
await expectError("B nie wgra pliku do folderu A", () =>
  as(B, () => db.query("insert into storage.objects (bucket_id, name) values ('contracts', $1)", [`${A.id}/inny.pdf`])), /row-level security/);

// D odszedł z zespołu (sekcja 7). Jego plik podpięty pod misję zespołu zostaje dla zespołu.
const mD = await as(A, async () =>
  (await one("insert into missions (workspace_id, partner_id, owner_user_id) values ($1, $2, $3) returning id", [wsA, pA, A.id])).id,
);
const convD = await as(A, async () => (await one("insert into conversations (mission_id, channel) values ($1, 'phone') returning id", [mD])).id);
await db.query("insert into contracts (mission_id, document_path) values ($1, $2)", [mD, `${D.id}/${mD}.pdf`]);
await db.query("insert into recordings (conversation_id, storage_path) values ($1, $2)", [convD, `${D.id}/r.webm`]);
await db.query(
  `insert into storage.objects (bucket_id, name, owner, created_at) values
   ('contracts', $1, $2, now() - interval '2 days'), ('recordings', $3, $2, now() - interval '2 days'),
   ('contracts', $4, $2, now()), ('contracts', $5, $2, now() - interval '3 days')`,
  [`${D.id}/${mD}.pdf`, D.id, `${D.id}/r.webm`, `${D.id}/swoj.pdf`, `${D.id}/stary-sierota.pdf`],
);
const filesD = await as(D, () => all("select name from storage.objects order by name"));
ok(filesD.length === 1 && filesD[0].name.endsWith("swoj.pdf"), `D po odejściu widzi tylko swój niepodpięty plik (${filesD.map((f) => f.name.split("/")[1]).join(", ")})`);
const delD = await as(D, () => db.query("delete from storage.objects where name = $1", [`${D.id}/r.webm`]));
ok((delD.affectedRows ?? 0) === 0, "D nie skasuje nagrania zespołu ze swojego folderu");
const updD = await as(D, () => db.query("update storage.objects set owner = $2 where name = $1", [`${D.id}/${mD}.pdf`, D.id]));
ok((updD.affectedRows ?? 0) === 0, "D nie nadpisze umowy zespołu");
const filesAfterD = await as(A, () => all("select name from storage.objects where name like $1", [`${D.id}/%`]));
ok(filesAfterD.length === 2, "zespół dalej czyta umowę i nagranie wgrane przez D");
// Zespół usuwa umowę misji (np. razem z partnerem) — stary plik D nie wraca do D.
await db.query("delete from contracts where mission_id = $1", [mD]);
const orphanD = await as(D, () => all("select name from storage.objects where name = $1", [`${D.id}/${mD}.pdf`]));
ok(orphanD.length === 0, "po usunięciu umowy stary plik nie wraca do osoby, która odeszła");
const oldOrphan = await as(D, () => all("select name from storage.objects where name = $1", [`${D.id}/stary-sierota.pdf`]));
ok(oldOrphan.length === 0, "stary niepodpięty plik nie jest dostępny nawet w swoim folderze");
// Zespół kasuje pliki swoich misji, obcy nie.
const cDel = await as(C, () => db.query("delete from storage.objects where name = $1", [`${A.id}/${mA}.pdf`]));
ok((cDel.affectedRows ?? 0) === 0, "obcy nie skasuje umowy zespołu");
const bDel = await as(B, () => db.query("delete from storage.objects where name = $1", [`${A.id}/${mA}.pdf`]));
ok((bDel.affectedRows ?? 0) === 1, "członek zespołu kasuje plik umowy misji zespołu");

console.log("11) Ostatni admin odchodzi do innego zespołu");
const wsE = await as(E, async () => (await one("select public.ensure_workspace() as ws")).ws);
const tokenF = await as(E, async () => (await one("select public.create_workspace_invite(null) as t")).t);
await as(F, () => db.query("select public.accept_workspace_invite($1)", [tokenF]));
const tokenPending = await as(E, async () => (await one("select public.create_workspace_invite(null) as t")).t);
const tokenToA = await as(A, async () => (await one("select public.create_workspace_invite(null) as t")).t);
await as(E, () => db.query("select public.accept_workspace_invite($1)", [tokenToA]));
const fRole = await one("select role, workspace_id from profiles where id = $1", [F.id]);
ok(fRole.role === "admin" && fRole.workspace_id === wsE, "F przejmuje administratora po odejściu E");
const ePeek = await as(C, () => one("select status from public.peek_workspace_invite($1)", [tokenPending]));
ok(ePeek.status === "revoked", "otwarte zaproszenia E do starego workspace są cofnięte");

console.log("12) Wersja misji (updated_at)");
const v1 = (await one("select updated_at::text as v from missions where id = $1", [mA])).v;
await as(A, () => db.query("update missions set next_step_label = 'X' where id = $1", [mA]));
const v2 = (await one("select updated_at::text as v from missions where id = $1", [mA])).v;
ok(v1 !== v2, "każdy zapis misji zmienia updated_at");
const stale = await as(B, () => db.query("update missions set next_step_label = 'Y' where id = $1 and updated_at = $2::timestamptz", [mA, v1]));
ok((stale.affectedRows ?? 0) === 0, "zapis ze starą wersją nie przechodzi");
const fresh = await as(B, () => db.query("update missions set next_step_label = 'Y' where id = $1 and updated_at = $2::timestamptz", [mA, v2]));
ok((fresh.affectedRows ?? 0) === 1, "zapis z aktualną wersją przechodzi");

console.log("13) Usuwanie wpisów dziennika");
const cOfA = await as(A, async () => (await one("insert into conversations (mission_id, channel, outcome) values ($1, 'phone', 'no_answer') returning id", [mA])).id);
const cOfB = await as(B, async () => (await one("insert into conversations (mission_id, channel, outcome) values ($1, 'phone', 'no_answer') returning id", [mA])).id);
const bDelA = await as(B, () => db.query("delete from conversations where id = $1", [cOfA]));
ok((bDelA.affectedRows ?? 0) === 0, "handlowiec nie usuwa cudzego wpisu");
const bDelB = await as(B, () => db.query("delete from conversations where id = $1", [cOfB]));
ok((bDelB.affectedRows ?? 0) === 1, "handlowiec usuwa swój wpis");
const aDelLegacy = await as(B, () => db.query("delete from conversations where id = $1", [oldConvo]));
ok((aDelLegacy.affectedRows ?? 0) === 1, "stary wpis bez autora może usunąć każdy z zespołu");
const adminDel = await as(A, () => db.query("delete from conversations where id = $1", [cOfA]));
ok((adminDel.affectedRows ?? 0) === 1, "admin usuwa wpis");
const seen = await as(B, () => all("select id from conversations where mission_id = $1", [mA]));
ok(seen.length >= 1, "zespół dalej czyta dziennik");
const cOfA2 = await as(A, async () => (await one("insert into conversations (mission_id, channel) values ($1, 'email') returning id", [mA])).id);
const tamper = await as(B, () => db.query("update conversations set created_by = null where id = $1", [cOfA2]));
ok((tamper.affectedRows ?? 0) === 0, "wpisu nie da się edytować (np. podmienić autora)");
await expectError("nie da się dopisać wpisu jako ktoś inny", () =>
  as(B, () => db.query("insert into conversations (mission_id, channel, created_by) values ($1, 'phone', $2)", [mA, A.id])), /row-level security/);
const stillA = await one("select created_by from conversations where id = $1", [cOfA2]);
ok(stillA.created_by === A.id, "autor wpisu bez zmian");

console.log("14) v5: dane firmy");
// Stara baza z kolumną nip w innym formacie (np. z innej aplikacji).
await db.exec("alter table public.partners add column if not exists nip text");
await db.exec("alter table public.partners add column if not exists regon bigint");
await db.query("update partners set nip = '525-000-77-38', regon = 123456785 where id = $1", [pA]);
const pBad = (await one("insert into partners (workspace_id, name, nip, notes) values ($1, 'Zły NIP', '12-34', 'stara notatka') returning id", [wsA])).id;
await db.exec(v5);
await db.exec(v5);
const nipRow = await one("select nip, legal_name, regon from partners where id = $1", [pA]);
ok(nipRow.nip === "5250007738", "istniejący NIP z kreskami znormalizowany do cyfr");
ok(nipRow.regon === "123456785", "REGON jako liczba przerobiony na tekst");
const bad = await one("select nip, notes from partners where id = $1", [pBad]);
ok(bad.nip === null && bad.notes.includes("stara notatka") && bad.notes.includes("NIP do sprawdzenia: 12-34"), "zły NIP przeniesiony do notatki");
await as(A, () => db.query("update partners set notes = 'edycja po migracji' where id = $1", [pBad]));
ok((await one("select notes from partners where id = $1", [pBad])).notes === "edycja po migracji", "partner ze złym NIP dalej edytowalny");
const validated = await all("select conname, convalidated from pg_constraint where conname in ('partners_nip_format', 'partners_regon_format')");
ok(validated.length === 2 && validated.every((c) => c.convalidated), "ograniczenia sprawdzone na istniejących wierszach");
await as(A, () => db.query("update partners set legal_name = 'Nova sp. z o.o.', legal_address = 'ul. Długa 1', regon = '123456785', billing_email = 'f@nova.pl' where id = $1", [pA]));
const filled = await as(A, () => one("select legal_name, regon, billing_email from partners where id = $1", [pA]));
ok(filled.legal_name === "Nova sp. z o.o." && filled.regon === "123456785", "handlowiec zapisuje dane firmy");
await expectError("NIP z kreskami nie wchodzi do kolumny", () =>
  as(A, () => db.query("update partners set nip = '525-000-77-38' where id = $1", [pA])), /partners_nip_format/);
await expectError("REGON o złej długości odrzucony", () =>
  as(A, () => db.query("update partners set regon = '1234' where id = $1", [pA])), /partners_regon_format/);
const outsider = await as(C, () => all("select nip from partners where id = $1", [pA]));
ok(outsider.length === 0, "obcy workspace nie widzi danych firmy");
const idx = await one("select count(*)::int as n from pg_indexes where indexname = 'partners_workspace_nip_idx'");
ok(idx.n === 1, "indeks po NIP");

console.log("15) v6: kto co edytuje, przekazanie misji, podpis, szablon");
const G = { id: "99999999-0000-4000-8000-000000000007", email: "szefowa@zespol.pl", name: "Gosia" };
const H = { id: "88888888-0000-4000-8000-000000000008", email: "handlowiec@zespol.pl", name: "Henryk" };
for (const u of [G, H]) {
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [u.id, u.email, JSON.stringify({ full_name: u.name })]);
}
const wsG = await as(G, async () => (await one("select public.ensure_workspace() as ws", [])).ws);
await as(H, () => db.query("select public.ensure_workspace()"));
const tokenH = await as(G, async () => (await one("select public.create_workspace_invite($1) as t", [H.email])).t);
await as(H, () => db.query("select public.accept_workspace_invite($1)", [tokenH]));
const pG = await as(G, async () => (await one("insert into partners (workspace_id, name, owner_user_id) values ($1, 'Bistro Gosi', $2) returning id", [wsG, G.id])).id);
const mG = await as(G, async () => (await one("insert into missions (workspace_id, partner_id, owner_user_id) values ($1, $2, $3) returning id", [wsG, pG, G.id])).id);
const mOld = await as(G, async () => (await one("insert into missions (workspace_id, partner_id, owner_user_id, status) values ($1, $2, $3, 'won') returning id", [wsG, pG, G.id])).id);
await as(G, () => db.query("insert into contracts (mission_id, signed_by_human, signed_at, status) values ($1, true, '2026-09-01T10:00:00Z', 'signed')", [mOld]));
await db.exec(v6);
await db.exec(v6);
const legacy = await one("select partner_signed_at from contracts where mission_id = $1", [mOld]);
ok(legacy.partner_signed_at !== null, "stara podpisana umowa ma podpis partnera");

const seenByH = await as(H, () => all("select id from missions where id = $1", [mG]));
ok(seenByH.length === 1, "handlowiec widzi cudzą misję");
const hUpd = await as(H, () => db.query("update missions set next_step_label = 'H' where id = $1", [mG]));
ok((hUpd.affectedRows ?? 0) === 0, "handlowiec nie edytuje cudzej misji");
await expectError("handlowiec nie dopisuje potrzeby do cudzej misji", () =>
  as(H, () => db.query("insert into needs (mission_id, category, title) values ($1, 'margin', 'x')", [mG])), /row-level security/);
await expectError("handlowiec nie dopisuje kontaktu w dzienniku cudzej misji", () =>
  as(H, () => db.query("insert into conversations (mission_id, channel) values ($1, 'phone')", [mG])), /row-level security/);
await expectError("handlowiec nie dodaje zadania do cudzej misji", () =>
  as(H, () => db.query("insert into tasks (workspace_id, mission_id, title) values ($1, $2, 'x')", [wsG, mG])), /row-level security/);
const hPartner = await as(H, () => db.query("update partners set notes = 'H' where id = $1", [pG]));
ok((hPartner.affectedRows ?? 0) === 0, "handlowiec nie edytuje cudzego partnera");
await expectError("handlowiec nie przekaże cudzej misji", () =>
  as(H, () => db.query("select public.transfer_mission($1, $2)", [mG, H.id])), /właściciel albo administrator/);
await expectError("misji nie da się założyć na kogoś innego", () =>
  as(H, () => db.query("insert into missions (workspace_id, partner_id, owner_user_id) values ($1, $2, $3)", [wsG, pG, G.id])), /row-level security/);

const pH = await as(H, async () => (await one("insert into partners (workspace_id, name, owner_user_id) values ($1, 'Pub Henia', $2) returning id", [wsG, H.id])).id);
const mH = await as(H, async () => (await one("insert into missions (workspace_id, partner_id, owner_user_id) values ($1, $2, $3) returning id", [wsG, pH, H.id])).id);
const hOwn = await as(H, () => db.query("update missions set next_step_label = 'moje' where id = $1", [mH]));
ok((hOwn.affectedRows ?? 0) === 1, "handlowiec edytuje swoją misję");
await as(H, () => db.query("update missions set current_stage = 'contact' where id = $1", [mH]));
const evH = await as(H, () => all("select kind, to_value from mission_events where mission_id = $1 and kind = 'stage'", [mH]));
ok(evH.some((e) => e.to_value === "contact"), "historia etapów działa po v6");
await as(H, () => db.query("insert into storage.objects (bucket_id, name, owner) values ('contracts', $1, $2)", [`${H.id}/${mH}/umowa.pdf`, H.id]));
const hFile = await as(H, () => all("select name from storage.objects where bucket_id = 'contracts' and name = $1", [`${H.id}/${mH}/umowa.pdf`]));
ok(hFile.length === 1, "handlowiec wgrywa PDF umowy do swojej misji");
const gAdmin = await as(G, () => db.query("update missions set next_step_label = 'admin' where id = $1", [mH]));
ok((gAdmin.affectedRows ?? 0) === 1, "administrator edytuje każdą misję");
await expectError("właściciel spoza zespołu odrzucony", () =>
  as(G, () => db.query("update missions set owner_user_id = $2 where id = $1", [mH, C.id])), /członkiem zespołu/);

// Partner z cudzą misją: handlowiec go nie usunie (kaskada skasowałaby misję szefowej), pliki zostają.
const pShared = await as(H, async () => (await one("insert into partners (workspace_id, name, owner_user_id) values ($1, 'Wspólny', $2) returning id", [wsG, H.id])).id);
const mSharedG = await as(G, async () => (await one("insert into missions (workspace_id, partner_id, owner_user_id) values ($1, $2, $3) returning id", [wsG, pShared, G.id])).id);
const gPath = `${G.id}/${mSharedG}/umowa.pdf`;
await as(G, () => db.query("insert into storage.objects (bucket_id, name, owner) values ('contracts', $1, $2)", [gPath, G.id]));
await as(G, () => db.query("insert into contracts (mission_id, document_path) values ($1, $2)", [mSharedG, gPath]));
const hDelFile = await as(H, () => db.query("delete from storage.objects where bucket_id = 'contracts' and name = $1", [gPath]));
ok((hDelFile.affectedRows ?? 0) === 0, "handlowiec nie kasuje pliku cudzej misji");
const hDelPartner = await as(H, () => db.query("delete from partners where id = $1", [pShared]));
ok((hDelPartner.affectedRows ?? 0) === 0, "handlowiec nie usunie partnera z cudzą misją");
ok((await all("select id from missions where id = $1", [mSharedG])).length === 1, "misja szefowej nietknięta");
// Podpisany skan widzi cały zespół; stary plik po podmianie kasuje prowadzący.
const scanPath = `${H.id}/${mH}/skan.jpg`;
await as(H, () => db.query("insert into storage.objects (bucket_id, name, owner, created_at) values ('contracts', $1, $2, now() - interval '3 days')", [scanPath, H.id]));
await as(H, () => db.query("insert into contracts (mission_id, signed_document_path, partner_signed_at) values ($1, $2, now())", [mH, scanPath]));
ok((await as(G, () => all("select name from storage.objects where name = $1", [scanPath]))).length === 1, "zespół widzi podpisany skan");
ok((await as(H, () => all("select name from storage.objects where name = $1", [scanPath]))).length === 1, "autor widzi swój skan po kilku dniach");
const oldPdf = `${H.id}/${mH}/stara.pdf`;
await as(H, () => db.query("insert into storage.objects (bucket_id, name, owner, created_at) values ('contracts', $1, $2, now() - interval '3 days')", [oldPdf, H.id]));
const prune = await as(H, () => db.query("delete from storage.objects where bucket_id = 'contracts' and name = $1", [oldPdf]));
ok((prune.affectedRows ?? 0) === 1, "prowadzący sprząta niepodpięty stary PDF swojej misji");

await as(G, () => db.query("insert into tasks (workspace_id, mission_id, title, owner_user_id) values ($1, $2, 'oddzwonić', $3)", [wsG, mG, G.id]));
const before = (await one("select updated_at::text as v from missions where id = $1", [mG])).v;
const version = await as(G, async () => (await one("select public.transfer_mission($1, $2)::text as v", [mG, H.id])).v);
const after = (await one("select updated_at::text as v from missions where id = $1", [mG])).v;
ok(version === after && version !== before, "przekazanie zwraca nową wersję misji");
const transferred = await one("select owner_user_id from missions where id = $1", [mG]);
ok(transferred.owner_user_id === H.id, "misja przekazana");
const movedTask = await one("select owner_user_id from tasks where mission_id = $1", [mG]);
ok(movedTask.owner_user_id === H.id, "otwarte zadania przechodzą z misją");
const hNow = await as(H, () => db.query("update missions set next_step_label = 'teraz moja' where id = $1", [mG]));
ok((hNow.affectedRows ?? 0) === 1, "po przekazaniu handlowiec edytuje misję");
const hPartnerNow = await as(H, () => db.query("update partners set notes = 'H' where id = $1", [pG]));
ok((hPartnerNow.affectedRows ?? 0) === 1, "prowadzący misję edytuje kartę partnera");
await as(H, () => db.query("insert into contracts (mission_id, status, sent_at) values ($1, 'sent', now())", [mG]));
await expectError("nieznany status umowy odrzucony", () =>
  as(H, () => db.query("update contracts set status = 'bogus' where mission_id = $1", [mG])), /contracts_status_check/);
const bucket = await one("select allowed_mime_types from storage.buckets where id = 'contracts'");
ok(String(bucket.allowed_mime_types).includes("image/jpeg"), "skan podpisanej umowy może być zdjęciem");

await expectError("handlowiec nie zmienia szablonu umowy", () =>
  as(H, () => db.query("select public.set_contract_template($1)", ["# Moja umowa"])), /administrator/);
await as(G, () => db.query("select public.set_contract_template($1)", ["  # Umowa zespołu  "]));
const tpl = await as(H, () => one("select contract_template from workspaces where id = $1", [wsG]));
ok(tpl.contract_template === "# Umowa zespołu", "admin zapisuje szablon, zespół go czyta");

console.log("16) v7: typ partnera, pojemność, szablon porozumienia");
// Tabela partnerów z innej aplikacji: bez typu, pojemność jako tekst.
await db.exec("alter table partners drop column segment");
await db.exec("alter table partners add column capacity text");
await db.query("update partners set capacity = '40 osób' where id = $1", [pG]);
await db.query("update partners set capacity = 'dużo' where id = $1", [pH]);
await db.query("update partners set capacity = '0' where id = $1", [pShared]);
const pRange = (await one("insert into partners (workspace_id, name, capacity) values ($1, 'Sala', '20-30 osób, 2 sale') returning id", [wsG])).id;
await db.exec(v7);
await db.exec(v7);
ok((await one("select capacity from partners where id = $1", [pRange])).capacity === 20, "„20-30 osób, 2 sale” → 20 (pierwsza liczba)");
const segCol = await one(
  "select data_type, udt_name, column_default from information_schema.columns where table_name = 'partners' and column_name = 'segment'",
);
ok(segCol?.udt_name === "partner_segment" && String(segCol.column_default).includes("venue"), "kolumna typu partnera wraca z domyślnym „venue”");
const capCol = await one("select data_type from information_schema.columns where table_name = 'partners' and column_name = 'capacity'");
ok(capCol?.data_type === "integer", "pojemność jako liczba");
const caps = await all("select id, capacity, segment from partners where id = any($1::uuid[])", [[pG, pH, pShared]]);
const capOf = (id) => caps.find((row) => row.id === id);
ok(capOf(pG)?.capacity === 40 && capOf(pG)?.segment === "venue", "„40 osób” → 40, istniejący partner to miejsce");
ok(capOf(pH)?.capacity === null && capOf(pShared)?.capacity === null, "tekst bez liczby i zero → puste");
const capCheck = await one("select convalidated from pg_constraint where conname = 'partners_capacity_range'");
ok(capCheck?.convalidated === true, "ograniczenie pojemności sprawdzone");
const community = await as(H, async () =>
  (await one("insert into partners (workspace_id, name, owner_user_id, segment) values ($1, 'Klub Pionek', $2, 'community') returning segment", [wsG, H.id])).segment,
);
ok(community === "community", "handlowiec dodaje społeczność");
await as(H, () => db.query("update partners set capacity = 60, segment = 'venue' where id = $1", [pH]));
ok((await one("select capacity from partners where id = $1", [pH])).capacity === 60, "handlowiec zapisuje pojemność swojego miejsca");
await expectError("pojemność 0 odrzucona", () =>
  as(H, () => db.query("update partners set capacity = 0 where id = $1", [pH])), /partners_capacity_range/);
await expectError("nieznany typ partnera odrzucony", () =>
  as(H, () => db.query("update partners set segment = 'sklep' where id = $1", [pH])), /partner_segment/);
await expectError("handlowiec nie zmienia szablonu porozumienia", () =>
  as(H, () => db.query("select public.set_agreement_template($1)", ["Temat: x"])), /administrator/);
await as(G, () => db.query("select public.set_agreement_template($1)", ["  Temat: Lutra × {{lokal}}\n\nTreść  "]));
const agreement = await as(H, () => one("select agreement_template from workspaces where id = $1", [wsG]));
ok(agreement.agreement_template === "Temat: Lutra × {{lokal}}\n\nTreść", "admin zapisuje szablon porozumienia, zespół go czyta");
await as(G, () => db.query("select public.set_agreement_template($1)", ["   "]));
ok((await one("select agreement_template from workspaces where id = $1", [wsG])).agreement_template === null, "pusty szablon = domyślny");
await expectError("za długi szablon odrzucony", () =>
  as(G, () => db.query("select public.set_agreement_template($1)", ["x".repeat(50001)])), /za długi/);
const otherWs = await as(C, () => all("select agreement_template from workspaces where id = $1", [wsG]));
ok(otherWs.length === 0, "obcy workspace nie widzi szablonu");
// Pojemność jako liczba z ułamkiem (np. numeric z innej aplikacji): zaokrąglenie, nie sklejanie cyfr.
await db.exec("alter table partners drop constraint partners_capacity_range");
await db.exec("alter table partners alter column capacity type numeric(8,2)");
await db.query("update partners set capacity = 40.4 where id = $1", [pG]);
await db.query("update partners set capacity = 0.4 where id = $1", [pH]);
await db.exec(v7);
const numeric = await all("select id, capacity from partners where id = any($1::uuid[])", [[pG, pH]]);
ok(numeric.find((row) => row.id === pG)?.capacity === 40 && numeric.find((row) => row.id === pH)?.capacity === null, "40.4 → 40, 0.4 → puste");


// --- v8 i ponowne odpalanie starszych migracji ---
console.log("\n== v8 i kolejność migracji");
await db.exec(v8);
await db.exec(v8);
const snapshot = async () => {
  const pol = (await db.query("select schemaname||'.'||tablename||'.'||policyname as k, cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'') as v from pg_policies")).rows;
  const fn = (await db.query("select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as k, md5(pg_get_functiondef(p.oid)) as v from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'")).rows;
  return new Map([...pol.map((r) => ["P " + r.k, r.v]), ...fn.map((r) => ["F " + r.k, r.v])]);
};
const versions = async () => (await all("select version from crm_migrations order by applied_at")).map((r) => r.version);
// Podpowiedzi AI: zapis tylko we własnym zespole i jako ja; czyta zespół; obcy i anon — nic.
const sugg = (ws, mission, user) =>
  db.query("insert into ai_suggestions (workspace_id, mission_id, user_id, outcome, engine, prompt_version, rows) values ($1, $2, $3, 'applied', 'claude', 'p-1', '[]'::jsonb)", [ws, mission, user]);
await as(H, () => sugg(wsG, mG, H.id));
ok((await as(G, () => all("select id from ai_suggestions where workspace_id = $1", [wsG]))).length === 1, "zespół widzi podpowiedzi AI swoich misji");
ok((await as(A, () => all("select id from ai_suggestions"))).length === 0, "obcy zespół nie widzi podpowiedzi AI");
await expectError("podpowiedź AI do cudzego zespołu odrzucona", () => as(A, () => sugg(wsG, mG, A.id)), /row-level security/);
await expectError("podpowiedź AI w cudzym imieniu odrzucona", () => as(H, () => sugg(wsG, mG, G.id)), /row-level security/);
await expectError("podpowiedź AI do misji z innego zespołu odrzucona", () => as(A, () => sugg(wsA, mG, A.id)), /row-level security/);
await expectError("anon nie zapisze podpowiedzi AI", () => as(null, () => sugg(wsG, mG, G.id)), /permission denied|row-level security/);
await expectError("podpowiedzi AI nie da się poprawić po fakcie", () => as(H, () => db.query("update ai_suggestions set outcome = 'discarded'")), /permission denied/);

// Metryki partnera: zespół czyta, edytuje ten, kto może edytować kartę; obcy zespół i anon — nic.
const metric = (partner, month, redemptions) =>
  db.query("insert into partner_metrics (partner_id, month, events, attendees, redemptions) values ($1, $2, 2, 10, $3) returning id, created_by", [partner, month, redemptions]);
const hMetric = await as(H, async () => (await metric(pH, "2026-09", 12)).rows[0]);
ok(hMetric?.created_by === H.id, "handlowiec zapisuje metryki swojego partnera (created_by = on)");
await as(H, () => db.query("insert into partner_metrics (partner_id, month, redemptions) values ($1, '2026-09', 14) on conflict (partner_id, month) do update set redemptions = excluded.redemptions, updated_at = now()", [pH]));
ok((await as(G, () => one("select redemptions from partner_metrics where partner_id = $1 and month = '2026-09'", [pH])))?.redemptions === 14, "upsert po (partner, miesiąc); administrator widzi metryki zespołu");
const pG2 = await as(G, async () => (await one("insert into partners (workspace_id, name, owner_user_id) values ($1, 'Klub Gosi', $2) returning id", [wsG, G.id])).id);
await as(G, () => metric(pG2, "2026-09", 5));
ok((await as(H, () => all("select id from partner_metrics where partner_id = $1", [pG2]))).length === 1, "handlowiec czyta metryki partnera kolegi");
await expectError("handlowiec nie dopisze metryk cudzego partnera", () => as(H, () => metric(pG2, "2026-08", 1)), /row-level security/);
const hUpdOther = await as(H, () => db.query("update partner_metrics set redemptions = 99 where partner_id = $1", [pG2]));
ok((hUpdOther.affectedRows ?? 0) === 0, "handlowiec nie poprawi metryk cudzego partnera");
const hDelOther = await as(H, () => db.query("delete from partner_metrics where partner_id = $1", [pG2]));
ok((hDelOther.affectedRows ?? 0) === 0, "handlowiec nie usunie metryk cudzego partnera");
ok((await as(A, () => all("select id from partner_metrics"))).length === 0, "obcy zespół nie widzi metryk");
await expectError("obcy zespół nie zapisze metryk", () => as(A, () => metric(pH, "2026-07", 1)), /row-level security/);
const aUpd = await as(A, () => db.query("update partner_metrics set redemptions = 0"));
ok((aUpd.affectedRows ?? 0) === 0, "obcy zespół nie poprawi metryk");
await expectError("anon nie czyta metryk", () => as(null, () => all("select id from partner_metrics")), /permission denied/);
await expectError("anon nie zapisze metryk", () => as(null, () => metric(pH, "2026-06", 1)), /permission denied|row-level security/);
await expectError("miesiąc w złym formacie odrzucony", () => as(H, () => metric(pH, "2026-13", 1)), /check constraint/);
await expectError("ujemne realizacje odrzucone", () => as(H, () => metric(pH, "2026-05", -1)), /check constraint/);
await expectError("drugi wiersz za ten sam miesiąc odrzucony", () => as(H, () => metric(pH, "2026-09", 1)), /duplicate key|unique/);
await expectError("notatka ponad 1000 znaków odrzucona", () =>
  as(H, () => db.query("insert into partner_metrics (partner_id, month, notes) values ($1, '2026-04', $2)", [pH, "x".repeat(1001)])), /check constraint/);
await as(H, () => db.query("delete from partner_metrics where partner_id = $1 and month = '2026-09'", [pH]));
ok((await all("select id from partner_metrics where partner_id = $1", [pH])).length === 0, "handlowiec usuwa metryki swojego partnera");
await db.query("delete from partners where id = $1", [pG2]);
ok((await all("select id from partner_metrics where partner_id = $1", [pG2])).length === 0, "usunięcie partnera kasuje jego metryki");

// Wynik dopasowania: każde kryterium 0–2 albo puste.
const fitUpd = await as(H, () => db.query("update partners set fit_dead_hours = 2, fit_capacity = 1, fit_area = 0 where id = $1", [pH]));
ok((fitUpd.affectedRows ?? 0) === 1, "handlowiec ocenia dopasowanie swojego lokalu");
ok((await one("select fit_dead_hours + fit_capacity + fit_area as s from partners where id = $1", [pH])).s === 3, "suma dopasowania 3/6");
await expectError("dopasowanie 3 odrzucone", () => as(H, () => db.query("update partners set fit_area = 3 where id = $1", [pH])), /partners_fit_range/);
await expectError("dopasowanie ujemne odrzucone", () => as(H, () => db.query("update partners set fit_capacity = -1 where id = $1", [pH])), /partners_fit_range/);
await as(H, () => db.query("update partners set fit_area = null where id = $1", [pH]));
ok((await one("select fit_area from partners where id = $1", [pH])).fit_area === null, "kryterium można wyczyścić");

// Limit AI w bazie: atomowo, na osobę i rodzaj, limity stałe w bazie; anon nic; tabela niewidoczna z zewnątrz.
const take = (user, kind = "extract", limit = 1000) =>
  as(user, async () => (await one("select public.take_ai_quota($1, $2, 60) as ok", [kind, limit])).ok);
const thirty = [];
for (let i = 0; i < 31; i++) thirty.push(await take(H));
ok(thirty.slice(0, 30).every(Boolean) && thirty[30] === false, "limit AI: 30 odczytów na godzinę, 31. odrzucony (limit z klienta ignorowany)");
ok((await take(H, "draft")) === true, "limit AI liczy osobno szkice");
ok((await take(G)) === true, "limit AI liczy osobno każdą osobę");
await expectError("anon nie wywoła limitu AI", () => as(null, () => db.query("select public.take_ai_quota('extract')")), /permission denied/);
await expectError("limit AI odrzuca nieznany rodzaj", () => as(H, () => db.query("select public.take_ai_quota('inne')")), /Nieprawidłowy limit/);
await expectError("tabela użycia AI niewidoczna dla handlowca", () => as(H, () => db.query("select * from ai_usage")), /permission denied/);

// Zapis misji w jednej transakcji: misja + tabele misji razem albo wcale, wersja sprawdzana w środku.
const bundle = async (id, version, mission, ops) =>
  (await db.query("select public.save_mission_bundle($1, $2, $3, $4) as r", [id, version, JSON.stringify(mission), JSON.stringify(ops)])).rows[0].r;
const mB = "77777777-0000-4000-8000-0000000000b1";
const missionCols = (patch = {}) => ({
  workspace_id: wsG, partner_id: pG, owner_user_id: G.id, status: "active", current_stage: "research",
  next_step_label: "Zadzwonić", next_step_at: "2026-11-01", outcome: null, loss_reason: null,
  details: { conversationNote: "pierwsza" }, closed_at: null, ...patch,
});
const needA = "77777777-0000-4000-8000-0000000000a1";
const needB = "77777777-0000-4000-8000-0000000000a2";
const fullOps = (needs) => [
  { table: "decision_context", op: "upsert", rows: [{ mission_id: mB, problem: "Puste środy", next_step: "Zadzwonić" }] },
  { table: "needs", op: "upsert", rows: needs.map((id) => ({ id, mission_id: mB, category: "off_peak", title: `Potrzeba ${id.slice(-2)}`, status: "observation", source: "manual" })) },
  { table: "mission_checklist_items", op: "upsert", rows: [{ mission_id: mB, stage: "research", item_key: "profile", label: "Profil", is_done: true, done_at: "2026-10-20T10:00:00Z" }] },
  { table: "mission_objections", op: "upsert", rows: [{ mission_id: mB, library_key: "margin", checked: true, argument_worked: false }] },
  { table: "offers", op: "upsert", rows: [{ mission_id: mB, variant: "A", custom_terms: { segment: "venue" }, recommended_by: "human", status: "draft" }] },
  { table: "contracts", op: "upsert", refs: { offer_id: "offers" }, optional: ["sent_at"], rows: [{ mission_id: mB, company_name: "Bistro Gosi sp. z o.o.", signed_by_human: false, sent_at: null, status: "draft" }] },
  { table: "activations", op: "upsert", refs: { contract_id: "contracts" }, optional: ["kolumna_z_przyszlosci"], rows: [{ mission_id: mB, partner_code: "LUTRA-X", hours_confirmed: true, kolumna_z_przyszlosci: 1 }] },
  { table: "tasks", op: "insert", key: "next_step", single: true, rows: [{ workspace_id: wsG, mission_id: mB, owner_user_id: G.id, title: "Zadzwonić", due_at: "2026-11-01", source: "next_step" }] },
];
const created = await as(G, () => bundle(mB, null, missionCols(), fullOps([needA, needB])));
const mBRow = await one("select updated_at = $2::timestamptz as same from missions where id = $1", [mB, created.version]);
ok(created.version && mBRow.same === true, "zapis misji w jednej transakcji: nowa misja, zwraca jej wersję");
const childCounts = await one(
  `select (select count(*) from decision_context where mission_id = $1)::int d, (select count(*) from needs where mission_id = $1)::int n,
          (select count(*) from mission_checklist_items where mission_id = $1)::int c, (select count(*) from mission_objections where mission_id = $1)::int o,
          (select count(*) from tasks where mission_id = $1)::int t,
          (select offer_id = (select id from offers where mission_id = $1) from contracts where mission_id = $1) offer_linked,
          (select contract_id = (select id from contracts where mission_id = $1) from activations where mission_id = $1) contract_linked`,
  [mB],
);
ok(childCounts.d === 1 && childCounts.n === 2 && childCounts.c === 1 && childCounts.o === 1 && childCounts.t === 1, "misja i wszystkie tabele misji zapisane jednym wywołaniem");
ok(childCounts.offer_linked === true && childCounts.contract_linked === true, "umowa wskazuje ofertę, aktywacja umowę (odczytane w trakcie zapisu)");
ok(created.returned?.next_step?.[0]?.title === "Zadzwonić" && created.returned.next_step[0].mission_id === mB, "zapis zwraca nowe zadanie następnego kroku");

const v1b = created.version;
const second = await as(G, () =>
  bundle(mB, v1b, missionCols({ next_step_label: "Wysłać ofertę", details: { conversationNote: "druga" } }), [
    { table: "needs", op: "delete", ids: [needB] },
    { table: "needs", op: "upsert", rows: [{ id: needA, mission_id: mB, category: "margin", title: "Marża", status: "fact", source: "manual" }] },
    { table: "tasks", op: "update", key: "next_step", single: true, ids: [created.returned.next_step[0].id], set: { title: "Wysłać ofertę" } },
  ]),
);
const afterSecond = await one("select next_step_label, details->>'conversationNote' as note, (select count(*) from needs where mission_id = $1)::int as n, (select category::text from needs where id = $2) as cat from missions where id = $1", [mB, needA]);
ok(second.version !== v1b && afterSecond.next_step_label === "Wysłać ofertę" && afterSecond.note === "druga", "kolejny zapis z aktualną wersją przechodzi i zmienia wersję");
ok(afterSecond.n === 1 && afterSecond.cat === "margin" && second.returned.next_step[0].title === "Wysłać ofertę", "usunięcie i zmiana potrzeb, zmiana zadania w tym samym zapisie");

const stateOf = async () =>
  JSON.stringify(await one(
    `select m.updated_at, m.next_step_label, m.details, (select jsonb_agg(n order by n.id) from needs n where n.mission_id = $1) needs,
            (select to_jsonb(d) from decision_context d where d.mission_id = $1) decision, (select jsonb_agg(t order by t.id) from tasks t where t.mission_id = $1) tasks
     from missions m where m.id = $1`,
    [mB],
  ));
const beforeFail = await stateOf();
await expectError("błąd w środku zapisu (zła kategoria potrzeby) przerywa całość", () =>
  as(G, () =>
    bundle(mB, second.version, missionCols({ next_step_label: "Nie powinno zostać" }), [
      { table: "decision_context", op: "upsert", rows: [{ mission_id: mB, problem: "Nie powinno zostać" }] },
      { table: "needs", op: "upsert", rows: [{ id: needB, mission_id: mB, category: "bogus", status: "observation", source: "manual" }] },
    ])), /need_category|invalid input value/);
ok((await stateOf()) === beforeFail, "po błędzie misja i tabele misji bez zmian (także wiersz misji i jego wersja)");
await expectError("stara wersja = konflikt", () =>
  as(G, () => bundle(mB, v1b, missionCols({ next_step_label: "Stara wersja" }), [
    { table: "decision_context", op: "upsert", rows: [{ mission_id: mB, problem: "Stara wersja" }] },
  ])), /mission_conflict/);
await expectError("nieznana wersja przy istniejącej misji = konflikt (bez nadpisania w ciemno)", () =>
  as(G, () => bundle(mB, null, missionCols({ next_step_label: "W ciemno" }), [])), /mission_conflict/);
ok((await stateOf()) === beforeFail, "konflikt niczego nie zmienia");

await expectError("handlowiec nie zapisze misji szefowej (RLS)", () =>
  as(H, () => bundle(mB, second.version, missionCols({ next_step_label: "H" }), [
    { table: "decision_context", op: "upsert", rows: [{ mission_id: mB, problem: "H" }] },
  ])), /mission_conflict/);
await expectError("handlowiec nie dopisze do misji szefowej przez swoją misję", () =>
  as(H, async () => {
    const vH = (await one("select updated_at::text as v from missions where id = $1", [mH])).v;
    return bundle(mH, vH, { next_step_label: "moje" }, [
      { table: "needs", op: "upsert", rows: [{ mission_id: mB, category: "margin", status: "observation", source: "manual", id: "77777777-0000-4000-8000-0000000000a3" }] },
    ]);
  }), /nie należy do tej misji/);
await expectError("obcy zespół nie zapisze misji zespołu", () =>
  as(A, () => bundle(mB, second.version, missionCols({ workspace_id: wsA, partner_id: pA, owner_user_id: A.id, next_step_label: "A" }), [])), /mission_conflict/);
await expectError("obcy zespół nie przejmie misji zespołu jako „nowej”", () =>
  as(A, () => bundle(mB, null, missionCols({ workspace_id: wsA, partner_id: pA, owner_user_id: A.id }), [])), /mission_conflict|row-level security/);
await expectError("anon nie wywoła zapisu misji", () => as(null, () => bundle(mB, second.version, missionCols(), [])), /permission denied/);
ok((await stateOf()) === beforeFail, "odrzucone zapisy innych osób niczego nie zmieniają");

const mBv = () => one("select updated_at::text as v from missions where id = $1", [mB]).then((r) => r.v);
const otherNeed = (await one("select id from needs where mission_id <> $1 limit 1", [mB]))?.id
  ?? (await as(H, async () => (await one("insert into needs (mission_id, category) values ($1, 'margin') returning id", [mH])).id));
await expectError("wiersz innej misji w operacjach odrzucony", async () =>
  as(G, async () => bundle(mB, await mBv(), missionCols(), [
    { table: "needs", op: "upsert", rows: [{ id: needB, mission_id: mH, category: "margin", status: "observation", source: "manual" }] },
  ])), /nie należy do tej misji/);
await expectError("istniejąca potrzeba innej misji nie zostanie przepięta", async () =>
  as(G, async () => bundle(mB, await mBv(), missionCols(), [
    { table: "needs", op: "upsert", rows: [{ id: otherNeed, mission_id: mB, category: "margin", status: "observation", source: "manual" }] },
  ])), /innej misji/);
await expectError("zmiana zadania innej misji odrzucona", async () =>
  as(G, async () => {
    const foreignTask = (await one("select id from tasks where mission_id = $1 limit 1", [mG])).id;
    return bundle(mB, await mBv(), missionCols(), [
      { table: "tasks", op: "update", single: true, ids: [foreignTask], set: { title: "cudze" } },
    ]);
  }), /Oczekiwano jednego/);
await expectError("zadanie w innym zespole odrzucone", async () =>
  as(G, async () => bundle(mB, await mBv(), missionCols(), [
    { table: "tasks", op: "insert", rows: [{ workspace_id: wsA, mission_id: mB, title: "x", source: "next_step" }] },
  ])), /nie należy do tej misji/);
await expectError("tabela spoza listy odrzucona", async () =>
  as(G, async () => bundle(mB, await mBv(), missionCols(), [
    { table: "partners", op: "update", ids: [pG], set: { notes: "x" } },
  ])), /nie należy do zapisu misji/);
await expectError("operacje na samej tabeli misji odrzucone", async () =>
  as(G, async () => bundle(mB, await mBv(), missionCols(), [
    { table: "missions", op: "delete", ids: [mG] },
  ])), /nie należy do zapisu misji/);
await expectError("nieznana kolumna (spoza „optional”) odrzucona", async () =>
  as(G, async () => bundle(mB, await mBv(), missionCols(), [
    { table: "activations", op: "upsert", rows: [{ mission_id: mB, nie_ma_takiej: 1 }] },
  ])), /does not exist/);
await expectError("zmiana mission_id w update odrzucona", async () =>
  as(G, async () => bundle(mB, await mBv(), missionCols(), [
    { table: "tasks", op: "update", ids: [created.returned.next_step[0].id], set: { mission_id: mG } },
  ])), /Nieprawidłowa zmiana/);
ok((await stateOf()) === beforeFail, "odrzucone operacje niczego nie zmieniają");
ok((await one("select count(*)::int as n from missions where id = $1 and owner_user_id = $2", [mG, H.id])).n === 1, "misja kolegi nietknięta");

// Rejestracja tylko z zaproszenia (hook Before User Created).
const hook = async (email, token) =>
  (await one("select public.crm_before_user_created($1::jsonb) as r", [JSON.stringify({ user: { email, user_metadata: token ? { invite_token: token } : {} } })])).r;
const inviteOpen = await as(G, async () => (await one("select public.create_workspace_invite(null) as t")).t);
const inviteMail = await as(G, async () => (await one("select public.create_workspace_invite($1) as t", ["nowa@zespol.pl"])).t);
ok((await hook("ktos@gmail.com", null)).error?.http_code === 403, "bez zaproszenia rejestracja odrzucona");
ok((await hook("ktos@gmail.com", "zly-kod")).error?.http_code === 403, "zły kod zaproszenia odrzucony");
ok(JSON.stringify(await hook("ktos@gmail.com", inviteOpen)) === "{}", "zaproszenie bez adresu wpuszcza");
ok(JSON.stringify(await hook("Nowa@Zespol.pl", inviteMail)) === "{}", "zaproszenie z adresem wpuszcza ten adres");
ok((await hook("inna@zespol.pl", inviteMail)).error?.http_code === 403, "zaproszenie z adresem nie wpuszcza innego adresu");
await expectError("hook rejestracji niedostępny dla zalogowanych", () => as(H, () => db.query("select public.crm_before_user_created('{}'::jsonb)")), /permission denied/);

const good = await snapshot();
ok((await versions()).at(-1) === "v8", "v8 zapisuje znacznik wersji");
await db.exec(v23);
const legacyLeft = await all("select policyname from pg_policies where policyname like '%\\_all' escape '\\' and schemaname = 'public'");
ok(legacyLeft.length === 0, "ponowne v2–v3 po v6 nie przywraca polityk „*_all”");
ok((await versions()).at(-1) === "v3", "znacznik pokazuje, że v2–v3 poszło po nowszych (CRM każe powtórzyć v4–v8)");
for (const sql of [v4, v5, v6, v7, v8]) await db.exec(sql);
const rerunState = await snapshot();
const changed = [...good.keys()].filter((k) => rerunState.get(k) !== good.get(k)).concat([...rerunState.keys()].filter((k) => !good.has(k)));
ok(changed.length === 0, `po powtórzeniu v4–v8 uprawnienia i funkcje jak przed (${changed.join(", ") || "bez różnic"})`);
const afterRerun = await as(G, async () =>
  bundle(mB, (await one("select updated_at::text as v from missions where id = $1", [mB])).v, missionCols({ next_step_label: "Po powtórce" }), [
    { table: "decision_context", op: "upsert", rows: [{ mission_id: mB, problem: "Po powtórce" }] },
  ]),
);
ok(afterRerun.version && (await one("select problem from decision_context where mission_id = $1", [mB])).problem === "Po powtórce", "zapis misji w jednej transakcji działa po powtórzeniu migracji");
await expectError("po powtórzeniu migracji anon dalej bez zapisu misji", () => as(null, () => bundle(mB, null, missionCols(), [])), /permission denied/);
const anonMigrations = await db.query("select has_table_privilege('anon', 'crm_migrations', 'insert') as ins");
ok(anonMigrations.rows[0].ins === false, "znaczników wersji nie zapisze nikt z zewnątrz");

console.log(`\nWynik: ${passes} ok, ${failures} błędów`);
process.exit(failures ? 1 : 0);
