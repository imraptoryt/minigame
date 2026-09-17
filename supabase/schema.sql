-- ============================================================================
-- LOS SANTOS CUSTOMS — COMPTA
-- Supabase schema: tables, RLS policies, permission engine, seed data
-- Run this once in the Supabase SQL editor (or `supabase db push`).
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. COMPANIES  (multi-tenant root — one row per server/entreprise)
-- ----------------------------------------------------------------------------
create table if not exists companies (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null default 'Los Santos Customs',
  logo_emoji    text not null default '🚘',
  theme         jsonb not null default '{"mode":"dark-sidebar","accent":"green","radius":"14"}'::jsonb,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. PROFILES  (extends auth.users — one row per employee login)
--    No real email is ever used: login is username OR char_id + password.
--    Supabase Auth still needs *an* email internally, so we generate a fake
--    one from the username (see resolve_login_email() below) — invisible to
--    the person, who only ever sees username / charid / password.
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  company_id      uuid not null references companies(id) on delete cascade,
  full_name       text not null,
  employee_number int,
  username        text not null,
  char_id         text,
  phone           text,
  bank_number     text,
  discord_id      text,
  avatar_emoji    text default '🧑',
  created_at      timestamptz not null default now(),
  constraint phone_format check (phone is null or phone like '555-%')
);
create index if not exists idx_profiles_company on profiles(company_id);
create unique index if not exists profiles_username_unique on profiles (lower(username));
create unique index if not exists profiles_charid_unique on profiles (lower(char_id)) where char_id is not null;

-- ----------------------------------------------------------------------------
-- 3. PERMISSIONS CATALOGUE (static, seeded — the full list of grantable perms)
-- ----------------------------------------------------------------------------
create table if not exists permissions (
  key         text primary key,
  category    text not null,
  label       text not null,
  description text
);

-- ----------------------------------------------------------------------------
-- 4. ROLES  (Discord-style: colored, ordered, can be a "base role")
-- ----------------------------------------------------------------------------
create table if not exists roles (
  id          uuid primary key default uuid_generate_v4(),
  company_id  uuid not null references companies(id) on delete cascade,
  name        text not null,
  color       text not null default '#8b8b93',
  is_base     boolean not null default false,   -- base roles are assigned to every new employee
  priority    int not null default 0,            -- higher = displayed first / outranks in UI
  created_at  timestamptz not null default now()
);
create index if not exists idx_roles_company on roles(company_id);

create table if not exists role_permissions (
  role_id         uuid not null references roles(id) on delete cascade,
  permission_key  text not null references permissions(key) on delete cascade,
  allowed         boolean not null default true,
  primary key (role_id, permission_key)
);

create table if not exists user_roles (
  user_id   uuid not null references profiles(id) on delete cascade,
  role_id   uuid not null references roles(id) on delete cascade,
  primary key (user_id, role_id)
);

-- Per-user overrides — "one perm by one", exactly like a Discord member overwrite.
-- allowed = true  -> force-grant regardless of roles
-- allowed = false -> force-deny regardless of roles
-- no row          -> inherit from roles
create table if not exists user_permission_overrides (
  user_id         uuid not null references profiles(id) on delete cascade,
  permission_key  text not null references permissions(key) on delete cascade,
  allowed         boolean not null,
  primary key (user_id, permission_key)
);

-- ----------------------------------------------------------------------------
-- 5. POINT DE VENTE — categories & products
-- ----------------------------------------------------------------------------
create table if not exists product_categories (
  id          uuid primary key default uuid_generate_v4(),
  company_id  uuid not null references companies(id) on delete cascade,
  key         text not null,          -- 'services' | 'ventes' | 'customs' | 'peinture' | custom
  label       text not null,
  icon        text default '📦',
  position    int not null default 0
);

create table if not exists products (
  id            uuid primary key default uuid_generate_v4(),
  company_id    uuid not null references companies(id) on delete cascade,
  category_id   uuid not null references product_categories(id) on delete cascade,
  sub_category  text,                 -- e.g. 'Apparence' / 'Performance' inside Customs — a tag from product_tags
  name          text not null,
  price         numeric(12,2) not null default 0,      -- 0 = gratuit / pas de prix
  cost_price    numeric(12,2) not null default 0,       -- "prix usine", 0 = aucun
  tax_rate      numeric(5,2) not null default 0,         -- % du prix qui part en charge/impôt société, 0 = aucun
  direct_payout boolean not null default true,           -- l'employé touche le prix directement (en jeu) :
                                                           -- compte dans son chiffre d'affaires, PAS dans son salaire à verser
  image_emoji   text default '🔧',
  active        boolean not null default true,
  position      int not null default 0
);
create index if not exists idx_products_company on products(company_id);
create index if not exists idx_products_category on products(category_id);

-- Manageable tags used as `sub_category` — create/rename/delete independently of products.
create table if not exists product_tags (
  id          uuid primary key default uuid_generate_v4(),
  company_id  uuid not null references companies(id) on delete cascade,
  category_id uuid not null references product_categories(id) on delete cascade,
  label       text not null
);
create index if not exists idx_product_tags_category on product_tags(category_id);

create table if not exists partners (
  id              uuid primary key default uuid_generate_v4(),
  company_id      uuid not null references companies(id) on delete cascade,
  name            text not null,
  commission_rate numeric(5,2) not null default 0,  -- percent, 0 = aucune commission
  active          boolean not null default true
);

create table if not exists sales (
  id             uuid primary key default uuid_generate_v4(),
  company_id     uuid not null references companies(id) on delete cascade,
  employee_id    uuid references employees(id),
  partner_id     uuid references partners(id),
  plate          text,
  subtotal       numeric(12,2) not null default 0,
  adjustment     numeric(12,2) not null default 0,   -- +markup / -discount, 0 = aucun
  commission     numeric(12,2) not null default 0,   -- 0 = aucune
  cost_total     numeric(12,2) not null default 0,   -- "prix usine" total
  tax_total      numeric(12,2) not null default 0,   -- part impôts/charges auto (produits taxés)
  payable_total  numeric(12,2) not null default 0,   -- part qui reste DUE à l'employé en salaire
                                                       -- (exclut les produits en "paiement direct")
  total          numeric(12,2) not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists idx_sales_company_date on sales(company_id, created_at);

create table if not exists sale_items (
  id             uuid primary key default uuid_generate_v4(),
  sale_id        uuid not null references sales(id) on delete cascade,
  product_id     uuid references products(id),
  name_snap      text not null,
  price_snap     numeric(12,2) not null,
  cost_snap      numeric(12,2) not null default 0,
  tax_rate_snap  numeric(5,2) not null default 0,
  direct_payout_snap boolean not null default true,
  qty            int not null default 1
);

-- Safety net for databases where these tables already existed before this
-- update (adds any missing column and fixes sales.employee_id, which used
-- to point at the wrong table). Safe to re-run.
alter table products add column if not exists tax_rate numeric(5,2) not null default 0;
alter table products add column if not exists direct_payout boolean not null default true;
alter table sales add column if not exists tax_total numeric(12,2) not null default 0;
alter table sales add column if not exists payable_total numeric(12,2) not null default 0;
alter table sale_items add column if not exists tax_rate_snap numeric(5,2) not null default 0;
alter table sale_items add column if not exists direct_payout_snap boolean not null default true;
alter table sales drop constraint if exists sales_employee_id_fkey;
alter table sales add constraint sales_employee_id_fkey foreign key (employee_id) references employees(id);

-- ----------------------------------------------------------------------------
-- 6. RESSOURCES HUMAINES
-- ----------------------------------------------------------------------------
create table if not exists employees (
  id            uuid primary key default uuid_generate_v4(),
  company_id    uuid not null references companies(id) on delete cascade,
  profile_id    uuid references profiles(id) on delete set null,
  full_name     text not null,
  grade         text not null default 'Employé',
  discord_id    text,
  hire_date     date default current_date,
  status        text not null default 'active',   -- active | archived
  hours_worked  numeric(10,2) not null default 0
);
create index if not exists idx_employees_company on employees(company_id);

create table if not exists shifts (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid not null references companies(id) on delete cascade,
  employee_id  uuid not null references employees(id) on delete cascade,
  clock_in     timestamptz not null default now(),
  clock_out    timestamptz
);

create table if not exists recruitment_applications (
  id             uuid primary key default uuid_generate_v4(),
  company_id     uuid not null references companies(id) on delete cascade,
  applicant_name text not null,
  discord_id     text,
  position       text,
  status         text not null default 'pending', -- pending | interview | accepted | rejected
  notes          text,
  created_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. COMPTABILITÉ
-- ----------------------------------------------------------------------------
create table if not exists payroll_entries (
  id              uuid primary key default uuid_generate_v4(),
  company_id      uuid not null references companies(id) on delete cascade,
  employee_id     uuid not null references employees(id) on delete cascade,
  week_number     int not null,
  chiffre_affaires numeric(12,2) not null default 0,
  avances         numeric(12,2) not null default 0,
  primes          numeric(12,2) not null default 0,
  salaire_brut    numeric(12,2) not null default 0,
  paid            boolean not null default false,
  created_at      timestamptz not null default now()
);

create table if not exists charges (
  id          uuid primary key default uuid_generate_v4(),
  company_id  uuid not null references companies(id) on delete cascade,
  label       text not null,
  category    text default 'Général',
  amount      numeric(12,2) not null default 0,
  recurring   boolean not null default false,
  due_date    date,
  paid        boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists client_invoices (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid not null references companies(id) on delete cascade,
  client_name  text not null,
  description  text,
  amount       numeric(12,2) not null default 0,
  status       text not null default 'pending', -- pending | paid | overdue
  due_date     date,
  created_at   timestamptz not null default now()
);

create table if not exists payable_invoices (
  id            uuid primary key default uuid_generate_v4(),
  company_id    uuid not null references companies(id) on delete cascade,
  supplier_name text not null,
  description   text,
  amount        numeric(12,2) not null default 0,
  status        text not null default 'pending',
  due_date      date,
  created_at    timestamptz not null default now()
);

create table if not exists bank_transactions (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid not null references companies(id) on delete cascade,
  label        text not null,
  type         text not null default 'credit', -- credit | debit
  amount       numeric(12,2) not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists inventory_items (
  id              uuid primary key default uuid_generate_v4(),
  company_id      uuid not null references companies(id) on delete cascade,
  name            text not null,
  category        text default 'Général',
  quantity        numeric(12,2) not null default 0,
  unit            text default 'unité',
  production_rate numeric(12,2) not null default 0
);

-- ----------------------------------------------------------------------------
-- 8. ANNONCES
-- ----------------------------------------------------------------------------
create table if not exists announcements (
  id          uuid primary key default uuid_generate_v4(),
  company_id  uuid not null references companies(id) on delete cascade,
  title       text not null,
  image_url   text,
  message     text not null,
  author_id   uuid references profiles(id),
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- PERMISSION ENGINE
-- ============================================================================
create or replace function public.has_permission(p_user_id uuid, p_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_override boolean;
  v_allowed  boolean;
begin
  select allowed into v_override
    from user_permission_overrides
    where user_id = p_user_id and permission_key = p_key;

  if v_override is not null then
    return v_override;
  end if;

  select true into v_allowed
    from user_roles ur
    join role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = p_user_id
      and rp.permission_key = p_key
      and rp.allowed = true
    limit 1;

  return coalesce(v_allowed, false);
end;
$$;

create or replace function public.current_company_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select company_id from profiles where id = auth.uid();
$$;

create or replace function public.current_employee_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from employees where profile_id = auth.uid() limit 1;
$$;

-- Resolve a login identifier (username OR char_id) to the synthetic email
-- used internally by Supabase Auth. Must be callable by signed-OUT visitors
-- (that's the whole point — it runs before login), so it's granted to
-- "anon". It only ever returns a non-secret, non-real email string.
create or replace function public.resolve_login_email(p_identifier text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  select username into v_username from profiles
    where lower(username) = lower(p_identifier) or lower(char_id) = lower(p_identifier)
    limit 1;
  if v_username is null then
    return null;
  end if;
  return lower(regexp_replace(v_username, '[^a-zA-Z0-9._-]', '', 'g')) || '@lsc.internal';
end;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table companies enable row level security;
alter table profiles enable row level security;
alter table permissions enable row level security;
alter table roles enable row level security;
alter table role_permissions enable row level security;
alter table user_roles enable row level security;
alter table user_permission_overrides enable row level security;
alter table product_categories enable row level security;
alter table product_tags enable row level security;
alter table products enable row level security;
alter table partners enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table employees enable row level security;
alter table shifts enable row level security;
alter table recruitment_applications enable row level security;
alter table payroll_entries enable row level security;
alter table charges enable row level security;
alter table client_invoices enable row level security;
alter table payable_invoices enable row level security;
alter table bank_transactions enable row level security;
alter table inventory_items enable row level security;
alter table announcements enable row level security;

-- Read: anyone belonging to the company can read. Permissions catalogue is global-read.
drop policy if exists "read own company" on companies;
create policy "read own company" on companies for select using (id = current_company_id());
drop policy if exists "read own company profiles" on profiles;
create policy "read own company profiles" on profiles for select using (company_id = current_company_id());
drop policy if exists "read permissions" on permissions;
create policy "read permissions" on permissions for select using (true);
drop policy if exists "read own company roles" on roles;
create policy "read own company roles" on roles for select using (company_id = current_company_id());
drop policy if exists "read role_permissions" on role_permissions;
create policy "read role_permissions" on role_permissions for select using (
  role_id in (select id from roles where company_id = current_company_id()));
drop policy if exists "read user_roles" on user_roles;
create policy "read user_roles" on user_roles for select using (
  user_id in (select id from profiles where company_id = current_company_id()));
drop policy if exists "read overrides" on user_permission_overrides;
create policy "read overrides" on user_permission_overrides for select using (
  user_id in (select id from profiles where company_id = current_company_id()));

drop policy if exists "read categories" on product_categories;
create policy "read categories" on product_categories for select using (company_id = current_company_id());
drop policy if exists "read tags" on product_tags;
create policy "read tags" on product_tags for select using (company_id = current_company_id());
drop policy if exists "read products" on products;
create policy "read products" on products for select using (company_id = current_company_id());
drop policy if exists "read partners" on partners;
create policy "read partners" on partners for select using (company_id = current_company_id());
drop policy if exists "read sales" on sales;
create policy "read sales" on sales for select using (company_id = current_company_id());
drop policy if exists "read sale_items" on sale_items;
create policy "read sale_items" on sale_items for select using (
  sale_id in (select id from sales where company_id = current_company_id()));
drop policy if exists "read employees" on employees;
create policy "read employees" on employees for select using (company_id = current_company_id());
drop policy if exists "read shifts" on shifts;
create policy "read shifts" on shifts for select using (company_id = current_company_id());
drop policy if exists "read recruitment" on recruitment_applications;
create policy "read recruitment" on recruitment_applications for select using (company_id = current_company_id());
drop policy if exists "read payroll" on payroll_entries;
create policy "read payroll" on payroll_entries for select using (
  company_id = current_company_id() and
  (has_permission(auth.uid(), 'accounting.manage_salaires') or employee_id = current_employee_id())
);
drop policy if exists "read charges" on charges;
create policy "read charges" on charges for select using (
  company_id = current_company_id() and has_permission(auth.uid(), 'accounting.manage_charges'));
drop policy if exists "read client_invoices" on client_invoices;
create policy "read client_invoices" on client_invoices for select using (
  company_id = current_company_id() and has_permission(auth.uid(), 'accounting.manage_facturation_client'));
drop policy if exists "read payable_invoices" on payable_invoices;
create policy "read payable_invoices" on payable_invoices for select using (
  company_id = current_company_id() and has_permission(auth.uid(), 'accounting.manage_factures_a_payer'));
drop policy if exists "read bank" on bank_transactions;
create policy "read bank" on bank_transactions for select using (
  company_id = current_company_id() and has_permission(auth.uid(), 'company.manage_bank'));
drop policy if exists "read inventory" on inventory_items;
create policy "read inventory" on inventory_items for select using (company_id = current_company_id());
drop policy if exists "read announcements" on announcements;
create policy "read announcements" on announcements for select using (company_id = current_company_id());

-- Write: gated by has_permission() against the matching permission key.
drop policy if exists "write roles" on roles;
create policy "write roles" on roles for all using (
  company_id = current_company_id() and has_permission(auth.uid(), 'company.manage_roles')
) with check (company_id = current_company_id() and has_permission(auth.uid(), 'company.manage_roles'));

drop policy if exists "write role_permissions" on role_permissions;
create policy "write role_permissions" on role_permissions for all using (
  has_permission(auth.uid(), 'company.manage_roles')
) with check (has_permission(auth.uid(), 'company.manage_roles'));

drop policy if exists "write user_roles" on user_roles;
create policy "write user_roles" on user_roles for all using (
  has_permission(auth.uid(), 'company.manage_roles')
) with check (has_permission(auth.uid(), 'company.manage_roles'));

drop policy if exists "write overrides" on user_permission_overrides;
create policy "write overrides" on user_permission_overrides for all using (
  has_permission(auth.uid(), 'company.manage_roles')
) with check (has_permission(auth.uid(), 'company.manage_roles'));

drop policy if exists "write products" on products;
create policy "write products" on products for all using (
  company_id = current_company_id() and has_permission(auth.uid(), 'company.manage_settings')
) with check (company_id = current_company_id() and has_permission(auth.uid(), 'company.manage_settings'));

drop policy if exists "write categories" on product_categories;
create policy "write categories" on product_categories for all using (
  company_id = current_company_id() and has_permission(auth.uid(), 'company.manage_settings')
) with check (company_id = current_company_id() and has_permission(auth.uid(), 'company.manage_settings'));

drop policy if exists "write tags" on product_tags;
create policy "write tags" on product_tags for all using (
  company_id = current_company_id() and has_permission(auth.uid(), 'company.manage_settings')
) with check (company_id = current_company_id() and has_permission(auth.uid(), 'company.manage_settings'));

drop policy if exists "write partners" on partners;
create policy "write partners" on partners for all using (
  company_id = current_company_id() and has_permission(auth.uid(), 'company.manage_partners')
) with check (company_id = current_company_id() and has_permission(auth.uid(), 'company.manage_partners'));

drop policy if exists "write sales" on sales;
create policy "write sales" on sales for insert with check (
  company_id = current_company_id() and has_permission(auth.uid(), 'pos.access')
);
drop policy if exists "write sale_items" on sale_items;
create policy "write sale_items" on sale_items for insert with check (
  sale_id in (select id from sales where company_id = current_company_id())
);

drop policy if exists "write employees" on employees;
create policy "write employees" on employees for all using (
  company_id = current_company_id() and has_permission(auth.uid(), 'hr.manage_personnel')
) with check (company_id = current_company_id() and has_permission(auth.uid(), 'hr.manage_personnel'));

drop policy if exists "write shifts" on shifts;
create policy "write shifts" on shifts for all using (company_id = current_company_id())
  with check (company_id = current_company_id());

drop policy if exists "write recruitment" on recruitment_applications;
create policy "write recruitment" on recruitment_applications for all using (
  company_id = current_company_id() and has_permission(auth.uid(), 'hr.manage_recrutement')
) with check (company_id = current_company_id() and has_permission(auth.uid(), 'hr.manage_recrutement'));

drop policy if exists "write payroll" on payroll_entries;
create policy "write payroll" on payroll_entries for all using (
  company_id = current_company_id() and has_permission(auth.uid(), 'accounting.manage_salaires')
) with check (company_id = current_company_id() and has_permission(auth.uid(), 'accounting.manage_salaires'));

drop policy if exists "write charges" on charges;
create policy "write charges" on charges for all using (
  company_id = current_company_id() and has_permission(auth.uid(), 'accounting.manage_charges')
) with check (company_id = current_company_id() and has_permission(auth.uid(), 'accounting.manage_charges'));

drop policy if exists "write client_invoices" on client_invoices;
create policy "write client_invoices" on client_invoices for all using (
  company_id = current_company_id() and has_permission(auth.uid(), 'accounting.manage_facturation_client')
) with check (company_id = current_company_id() and has_permission(auth.uid(), 'accounting.manage_facturation_client'));

drop policy if exists "write payable_invoices" on payable_invoices;
create policy "write payable_invoices" on payable_invoices for all using (
  company_id = current_company_id() and has_permission(auth.uid(), 'accounting.manage_factures_a_payer')
) with check (company_id = current_company_id() and has_permission(auth.uid(), 'accounting.manage_factures_a_payer'));

drop policy if exists "write bank" on bank_transactions;
create policy "write bank" on bank_transactions for all using (
  company_id = current_company_id() and has_permission(auth.uid(), 'company.manage_bank')
) with check (company_id = current_company_id() and has_permission(auth.uid(), 'company.manage_bank'));

drop policy if exists "write inventory" on inventory_items;
create policy "write inventory" on inventory_items for all using (
  company_id = current_company_id() and has_permission(auth.uid(), 'company.manage_inventory')
) with check (company_id = current_company_id() and has_permission(auth.uid(), 'company.manage_inventory'));

drop policy if exists "write announcements" on announcements;
create policy "write announcements" on announcements for all using (
  company_id = current_company_id() and has_permission(auth.uid(), 'announcements.publish')
) with check (company_id = current_company_id() and has_permission(auth.uid(), 'announcements.publish'));

drop policy if exists "write own company" on companies;
create policy "write own company" on companies for update using (
  id = current_company_id() and has_permission(auth.uid(), 'company.manage_settings')
);

drop policy if exists "write own profile" on profiles;
create policy "write own profile" on profiles for update using (id = auth.uid());
drop policy if exists "insert own profile" on profiles;
create policy "insert own profile" on profiles for insert with check (id = auth.uid());

-- ============================================================================
-- SEED: permission catalogue (mirrors the sidebar exactly)
-- ============================================================================
insert into permissions (key, category, label, description) values
  ('dashboard.view',                    'Dashboard',           'Voir l''accueil',                 'Accès au tableau de bord principal'),
  ('pos.access',                        'Dashboard',           'Utiliser le point de vente',      'Ouvrir la page Point de vente'),
  ('pos.services',                      'Dashboard',           'Onglet Services',                 'Vendre les services (réparation, dépannage...)'),
  ('pos.ventes',                        'Dashboard',           'Onglet Ventes',                   'Vendre des véhicules'),
  ('pos.customs',                       'Dashboard',           'Onglet Customs',                  'Vendre des personnalisations'),
  ('pos.peinture',                      'Dashboard',           'Onglet Peinture',                 'Vendre des peintures'),
  ('pos.discount',                      'Dashboard',           'Appliquer une réduction',         null),
  ('pos.markup',                        'Dashboard',           'Appliquer une majoration',        null),
  ('sales.view_own',                    'Dashboard',           'Voir mes ventes',                 null),
  ('sales.view_all',                    'Dashboard',           'Voir toutes les ventes',          null),
  ('sales.view_bilan_employe',          'Dashboard',           'Voir le bilan employé',           null),

  ('accounting.view_bilan',             'Comptabilité',        'Voir le bilan',                   null),
  ('accounting.view_ventes',            'Comptabilité',        'Voir les ventes',                 null),
  ('accounting.view_ventes_par_produit','Comptabilité',        'Voir les ventes par produit',     null),
  ('accounting.manage_facturation_client','Comptabilité',      'Gérer la facturation client',     null),
  ('accounting.manage_factures_a_payer','Comptabilité',        'Gérer les factures à payer',      null),
  ('accounting.manage_salaires',        'Comptabilité',        'Gérer les salaires',              null),
  ('accounting.manage_charges',         'Comptabilité',        'Gérer les charges',               null),

  ('hr.view_personnel',                 'Ressources humaines', 'Voir le personnel',               null),
  ('hr.manage_personnel',               'Ressources humaines', 'Gérer le personnel',              null),
  ('hr.view_archives',                  'Ressources humaines', 'Voir les archives',               null),
  ('hr.manage_recrutement',             'Ressources humaines', 'Gérer le recrutement',            null),
  ('hr.manage_services',                'Ressources humaines', 'Gérer les services (prise de poste)', null),
  ('announcements.view',                'Ressources humaines', 'Voir les annonces',               null),
  ('announcements.publish',             'Ressources humaines', 'Publier une annonce',             null),

  ('company.manage_roles',              'Mon entreprise',      'Gérer les rôles',                 'Créer des rôles et attribuer les permissions'),
  ('company.manage_inventory',          'Mon entreprise',      'Gérer l''inventaire & production',null),
  ('company.manage_partners',           'Mon entreprise',      'Gérer les partenaires',           null),
  ('company.manage_bank',               'Mon entreprise',      'Gérer le compte bancaire',        null),
  ('company.manage_settings',           'Mon entreprise',      'Gérer les paramètres & le catalogue', null)
on conflict (key) do nothing;

-- ============================================================================
-- STARTER CATALOGUE (categories + products used by bootstrap_or_join below)
-- ============================================================================
create or replace function public.seed_starter_catalogue(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_services uuid;
  v_ventes   uuid;
  v_customs  uuid;
  v_peinture uuid;
begin
  insert into product_categories (company_id, key, label, icon, position) values
    (p_company_id, 'services', 'Services', '🛠️', 1) returning id into v_services;
  insert into product_categories (company_id, key, label, icon, position) values
    (p_company_id, 'ventes', 'Ventes', '🚗', 2) returning id into v_ventes;
  insert into product_categories (company_id, key, label, icon, position) values
    (p_company_id, 'customs', 'Customs', '🔧', 3) returning id into v_customs;
  insert into product_categories (company_id, key, label, icon, position) values
    (p_company_id, 'peinture', 'Peinture', '🎨', 4) returning id into v_peinture;

  insert into products (company_id, category_id, name, price, cost_price, image_emoji, position) values
    (p_company_id, v_services, 'Carrosserie',              50,  20, '💥', 1),
    (p_company_id, v_services, 'Depannage (/km)',          50,  10, '🚛', 2),
    (p_company_id, v_services, 'Fourrière',                150, 40, '🅿️', 3),
    (p_company_id, v_services, 'Fourrière bat/avi/héli',   300, 90, '🚁', 4),
    (p_company_id, v_services, 'Nettoyage',                50,  10, '🚿', 5),
    (p_company_id, v_services, 'Pneu',                     100, 35, '🛞', 6),
    (p_company_id, v_services, 'Répa Complète',            250, 80, '🔩', 7),
    (p_company_id, v_services, 'Répa Moteur',               200, 70, '🧯', 8);

  insert into products (company_id, category_id, sub_category, name, price, cost_price, image_emoji, position) values
    (p_company_id, v_customs, 'Apparence', 'Accessoire (extra)',        350, 120, '🐵', 1),
    (p_company_id, v_customs, 'Apparence', 'Ailerons',                  700, 250, '🏎️', 2),
    (p_company_id, v_customs, 'Apparence', 'Antenne',                   450, 150, '📡', 3),
    (p_company_id, v_customs, 'Apparence', 'Cadran',                    500, 180, '🎛️', 4),
    (p_company_id, v_customs, 'Apparence', 'Calandre',                  600, 210, '🚙', 5),
    (p_company_id, v_customs, 'Apparence', 'Capot',                     650, 230, '🚘', 6),
    (p_company_id, v_customs, 'Apparence', 'Carrosserie (bas de caisse)', 500, 180, '🛻', 7),
    (p_company_id, v_customs, 'Performance', 'Châssis',                 650, 240, '⚙️', 8),
    (p_company_id, v_customs, 'Apparence', 'Couleur fumée pneus',       450, 150, '💨', 9),
    (p_company_id, v_customs, 'Apparence', 'Couleur intérieur',         200, 60,  '🪑', 10);

  insert into products (company_id, category_id, name, price, cost_price, image_emoji, position) values
    (p_company_id, v_ventes, 'Véhicule occasion',   8000, 5000, '🚗', 1),
    (p_company_id, v_ventes, 'Véhicule neuf',       25000, 18000, '🚙', 2);

  insert into products (company_id, category_id, name, price, cost_price, image_emoji, position) values
    (p_company_id, v_peinture, 'Peinture mate',       400, 140, '🎨', 1),
    (p_company_id, v_peinture, 'Peinture métallisée', 600, 220, '🎨', 2),
    (p_company_id, v_peinture, 'Peinture chrome',     900, 350, '🎨', 3);
end;
$$;

-- ============================================================================
-- ONBOARDING: first signup becomes the Patron & bootstraps the company;
-- every signup after that auto-joins the existing company on the lowest
-- base role (e.g. "Employé"). Called once from the app right after signup.
-- ============================================================================
create or replace function public.bootstrap_or_join(
  p_full_name text,
  p_username text,
  p_char_id text default null,
  p_phone text default null,
  p_bank_number text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_role_id    uuid;
  v_emp_no     int;
  v_is_owner   boolean := false;
begin
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'Un profil existe déjà pour cet utilisateur';
  end if;

  select id into v_company_id from companies order by created_at asc limit 1;
  v_emp_no := floor(random() * 900000 + 100000)::int;

  if v_company_id is null then
    insert into companies (name) values ('Los Santos Customs') returning id into v_company_id;
    v_is_owner := true;
  end if;

  insert into profiles (id, company_id, full_name, employee_number, username, char_id, phone, bank_number)
    values (auth.uid(), v_company_id, coalesce(nullif(p_full_name, ''), 'Employé'), v_emp_no,
            p_username, nullif(p_char_id, ''), nullif(p_phone, ''), nullif(p_bank_number, ''));

  if v_is_owner then
    insert into roles (company_id, name, color, is_base, priority)
      values (v_company_id, 'Patron', '#16A34A', true, 100) returning id into v_role_id;
    insert into role_permissions (role_id, permission_key) select v_role_id, key from permissions;

    insert into roles (company_id, name, color, is_base, priority)
      values (v_company_id, 'Employé', '#3B82F6', true, 10)
      returning id into v_role_id;
    insert into role_permissions (role_id, permission_key) values
      (v_role_id, 'dashboard.view'), (v_role_id, 'pos.access'), (v_role_id, 'pos.services'),
      (v_role_id, 'pos.ventes'), (v_role_id, 'sales.view_own'), (v_role_id, 'announcements.view');
    -- the Patron uses the Patron role, not this Employé one:
    select id into v_role_id from roles where company_id = v_company_id and name = 'Patron';

    perform seed_starter_catalogue(v_company_id);
  else
    select id into v_role_id from roles
      where company_id = v_company_id and is_base = true
      order by priority asc limit 1;

    if v_role_id is null then
      insert into roles (company_id, name, color, is_base, priority)
        values (v_company_id, 'Employé', '#3B82F6', true, 10) returning id into v_role_id;
      insert into role_permissions (role_id, permission_key) values
        (v_role_id, 'dashboard.view'), (v_role_id, 'pos.access'), (v_role_id, 'pos.services'),
        (v_role_id, 'pos.ventes'), (v_role_id, 'sales.view_own'), (v_role_id, 'announcements.view');
    end if;
  end if;

  insert into user_roles (user_id, role_id) values (auth.uid(), v_role_id);

  insert into employees (company_id, profile_id, full_name, grade, status)
    values (v_company_id, auth.uid(), coalesce(nullif(p_full_name, ''), 'Employé'),
            case when v_is_owner then 'Patron' else 'Employé' end, 'active');

  return v_company_id;
end;
$$;

grant execute on function public.bootstrap_or_join(text, text, text, text, text) to authenticated;
grant execute on function public.seed_starter_catalogue(uuid) to authenticated;
grant execute on function public.has_permission(uuid, text) to authenticated;
grant execute on function public.current_company_id() to authenticated;
grant execute on function public.current_employee_id() to authenticated;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

-- ============================================================================
-- NOTE ON GETTING STARTED — no admin account is seeded by this file.
-- On managed Supabase projects, the SQL editor usually can't write directly
-- into the internal auth.users/auth.identities tables (Supabase protects
-- them), so trying to pre-insert a "raptor" account here would silently do
-- nothing. Instead:
--   1. Go to Authentication ▸ Settings and turn OFF "Confirm email" (Enable
--      email confirmations). Accounts here never use a real email address,
--      so a confirmation link could never be delivered.
--   2. Run this whole file once in the Supabase SQL editor.
--   3. Deploy (or run locally) and open the app. Go to "Créer un compte"
--      and sign up with username "raptor" and password "admin" (fill in
--      any character ID / phone "555-..." / bank number). Being the very
--      first account, it becomes Patron automatically with every
--      permission, and seeds the starter catalogue (Services / Customs /
--      Ventes / Peinture).
--   4. Everyone who signs up afterwards only needs a username, an in-game
--      character ID, a password, their name, a phone number (555-...) and
--      a bank account number — no email, ever. They join the same company
--      on the base "Employé" role. Promote them from Mon entreprise ▸
--      Gestion des rôles ▸ Membres.
-- ============================================================================
