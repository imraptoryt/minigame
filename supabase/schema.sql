-- =====================================================================
-- LS Customs — stockage Supabase
-- Toutes les entités (Company, Employee, Role, Customer, Product, Sale,
-- SaleItem, Invoice, Payroll/Salary, Commission, Expense, InventoryItem,
-- InventoryTransaction, Partner, BankTransaction, WorkSession, Warning,
-- Recruitment, Notification, AuditLog) sont stockées dans un document
-- JSONB versionné, lu et écrit UNIQUEMENT par l'API serveur (api/rpc.js)
-- avec la clé service_role. Le navigateur et la NUI n'y ont jamais accès.
-- =====================================================================

create table if not exists public.lsc_state (
  id          int primary key default 1 check (id = 1),
  data        jsonb not null,
  version     int  not null default 1,
  updated_at  timestamptz not null default now()
);

-- RLS activée sans aucune policy : les clés anon/authenticated ne peuvent
-- ni lire ni écrire. Seule la clé service_role (côté Vercel) contourne RLS.
alter table public.lsc_state enable row level security;

-- Sauvegarde quotidienne du document principal (petit) : 30 jours.
create table if not exists public.lsc_backup (
  day         date primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now()
);
alter table public.lsc_backup enable row level security;

create or replace function public.lsc_backup_daily() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.lsc_backup (day, data) values (current_date, new.data)
  on conflict (day) do update set data = excluded.data, created_at = now();
  delete from public.lsc_backup where day < current_date - 30;
  return new;
end $$;

drop trigger if exists lsc_backup_trg on public.lsc_state;
create trigger lsc_backup_trg after insert or update on public.lsc_state
for each row execute function public.lsc_backup_daily();

-- =====================================================================
-- Lignes : ventes, commissions, services, opérations bancaires, historique,
-- mouvements de stock. Une action ne lit que ce dont elle a besoin
-- (lignes « en cours » + période / identifiants demandés).
-- =====================================================================
create table if not exists public.lsc_rows (
  kind  text not null,
  id    text not null,
  at    timestamptz not null,
  ref   text,
  open  boolean not null default false,
  data  jsonb not null,
  primary key (kind, id)
);
create index if not exists lsc_rows_at   on public.lsc_rows (at);
create index if not exists lsc_rows_open on public.lsc_rows (kind) where open;
create index if not exists lsc_rows_ref  on public.lsc_rows (ref) where ref is not null;
alter table public.lsc_rows enable row level security;

-- Écriture atomique : document principal (verrou optimiste sur la version) + lignes.
-- p_version = 0 : création initiale. Renvoie la nouvelle version, ou -1 en cas de conflit.
create or replace function public.lsc_commit(p_version int, p_core jsonb, p_up jsonb, p_del jsonb, p_reset boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if p_version = 0 then
    insert into lsc_state (id, data, version) values (1, p_core, 1) on conflict (id) do nothing returning version into v;
  else
    update lsc_state set data = p_core, version = version + 1, updated_at = now() where id = 1 and version = p_version returning version into v;
  end if;
  if v is null then return -1; end if;
  if p_reset then delete from lsc_rows where true; end if; -- « where true » : Supabase refuse un DELETE sans WHERE
  insert into lsc_rows (kind, id, at, ref, open, data)
    select r->>'kind', r->>'id', (r->>'at')::timestamptz, r->>'ref', coalesce((r->>'open')::boolean, false), r->'data'
    from jsonb_array_elements(coalesce(p_up, '[]'::jsonb)) r
  on conflict (kind, id) do update set at = excluded.at, ref = excluded.ref, open = excluded.open, data = excluded.data;
  delete from lsc_rows t using jsonb_array_elements(coalesce(p_del, '[]'::jsonb)) d
    where t.kind = d->>'kind' and t.id = d->>'id';
  return v;
end $$;
revoke execute on function public.lsc_commit(int, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
