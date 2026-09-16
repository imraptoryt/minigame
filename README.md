# Los Santos Customs — Compta

Un back-office complet pour un garage/customs FiveM : point de vente par
catégories, comptabilité, RH, et un système de rôles façon **Discord**
(rôles de base + permission par permission, exceptions par employé).

Stack : HTML/CSS/JS "vanilla" (pas de build), **Supabase** (base de données,
auth, sécurité), hébergé gratuitement sur **Vercel**.

---

## 1. Créer le projet Supabase

1. Va sur [supabase.com](https://supabase.com) → **New project**.
2. Une fois le projet créé, ouvre **SQL Editor** → **New query**, colle le
   contenu entier de [`supabase/schema.sql`](supabase/schema.sql) et
   exécute-le. Ça crée toutes les tables, la sécurité (RLS), le moteur de
   permissions, et tente de créer un **compte admin prêt à l'emploi**
   (`raptor` / `admin` — voir plus bas).
3. Va dans **Authentication → Settings** et **désactive "Confirm email"**
   (Enable email confirmations = OFF). C'est obligatoire ici : aucun compte
   n'utilise une vraie adresse email (voir plus bas), donc un email de
   confirmation ne pourrait jamais arriver.
4. Va dans **Project Settings → API** et note :
   - **Project URL**
   - **anon public key**

## 2. Configurer le site

Ouvre `assets/js/config.js` et remplace les deux valeurs :

```js
window.LSC_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",
};
```

La clé "anon" est faite pour être publique côté client — c'est la sécurité
au niveau des lignes (RLS), déjà en place dans `schema.sql`, qui protège
réellement les données.

## 3. Déployer sur Vercel

1. Pousse ce dossier sur un repo GitHub (ou glisse-dépose le dossier
   directement sur [vercel.com/new](https://vercel.com/new)).
2. Sur Vercel, "Import Project" → sélectionne le repo.
3. Aucune configuration de build nécessaire : c'est un site statique
   (Framework Preset = "Other"). Déploie.
4. Ouvre l'URL fournie par Vercel.

## 4. Premier lancement

1. Ouvre le site et connecte-toi directement avec le compte admin
   pré-créé : identifiant **`raptor`**, mot de passe **`admin`**
   (rôle Patron, toutes les permissions). **Change ce mot de passe tout de
   suite** depuis le menu de profil (en bas de la barre latérale) ▸ *Mot de
   passe*.
2. Si ce compte n'a pas pu être créé automatiquement (ça peut arriver selon
   la version de Supabase — voir la note dans `schema.sql`), va simplement
   dans **Créer un compte** et inscris-toi avec exactement ces mêmes
   identifiants (`raptor` / `admin`) : comme c'est alors le tout premier
   compte de l'entreprise, il devient Patron automatiquement, avec le même
   résultat.
3. Chaque personne qui crée un compte ensuite (onglet **Créer un compte**)
   rejoint la même entreprise avec le rôle de base **"Employé"** (accès
   limité). Tu peux ensuite lui attribuer d'autres rôles, ou forcer une
   permission précise pour elle uniquement, depuis **Mon entreprise ▸
   Gestion des rôles**.

---

## Connexion sans email

Comme demandé, il n'y a **aucun email** nulle part dans l'app :

- **Connexion** : identifiant (nom d'utilisateur *ou* ID personnage) + mot
  de passe.
- **Création de compte** : nom complet, nom d'utilisateur, ID personnage,
  mot de passe, téléphone (doit commencer par `555-`) et numéro de compte
  bancaire.

Techniquement, Supabase Auth a besoin d'un email en interne — l'app en
fabrique donc un invisible à partir du nom d'utilisateur
(`ethan.davis@lsc.internal`, jamais affiché ni utilisable pour recevoir un
vrai message) uniquement pour que la sécurité éprouvée de Supabase
(hachage du mot de passe, sessions, jetons) continue de fonctionner
normalement. Le nom d'utilisateur et l'ID personnage sont chacun uniques et
peuvent servir indifféremment à se connecter.

## Le système de rôles (façon Discord)

- **Mon entreprise ▸ Gestion des rôles** : crée autant de rôles que tu veux
  (couleur, nom), coche les permissions qu'il accorde, regroupées par
  section (Dashboard, Comptabilité, RH, Mon entreprise). Un rôle marqué
  **"Rôle de base"** est celui donné automatiquement aux nouveaux employés
  qui s'inscrivent.
- Un employé peut avoir **plusieurs rôles** — ses permissions sont l'union
  de tous ses rôles (onglet **Membres** de chaque rôle).
- **Permissions individuelles** (bas de la page) : comme un "permission
  overwrite" par membre sur Discord — force une permission précise à
  **Autorisé** ou **Refusé** pour une seule personne, peu importe ses
  rôles. Remets sur **Hérité** pour revenir au comportement normal.
- Tout ça est appliqué **à la fois côté interface** (le menu grise les
  pages non autorisées) **et côté base de données** (Row Level Security —
  même en trafiquant les requêtes, un utilisateur ne peut pas agir hors de
  ses permissions réelles).

## Le système de thème

- Chaque personne peut changer l'apparence depuis le menu de profil (en bas
  de la barre latérale) ou depuis **Mon entreprise ▸ Paramètres** : mode
  clair/sombre, 7 couleurs d'accent, et un arrondi (carré / doux / rond).
- Le choix est instantané et gardé sur l'appareil (`localStorage`).
- Un utilisateur avec la permission **"Gérer les paramètres"** peut cliquer
  "Définir comme thème par défaut de l'entreprise" pour que ce thème soit
  proposé à tout nouvel appareil/connexion.

## Le point de vente

- Les onglets (Services / Ventes / Customs / Peinture, ...) viennent de la
  table `product_categories` — ajoute, renomme ou supprime des catégories
  et des produits depuis **Mon entreprise ▸ Paramètres ▸ Catalogue
  produits**. Utilise les clés `services`, `ventes`, `customs`, `peinture`
  si tu veux que les permissions dédiées (`pos.services`, `pos.customs`,
  ...) s'appliquent ; toute autre clé reste visible à qui a l'accès général
  au Point de vente.
- Chaque produit a un **Prix** (facturé au client) et un **Prix usine**
  (son coût, affiché séparément dans le panier — comme dans tes captures).
- Un **partenaire** appliqué au panier calcule automatiquement une
  **commission** (%) affichée à part.
- **Réduction** / **Majoration** ouvrent une petite fenêtre pour appliquer
  un pourcentage ou un montant fixe au total.

## Structure du projet

```
index.html              connexion / création de compte
dashboard.html           accueil (résumé + graphique + fiche de paie)
pos.html                 point de vente
sales.html                mes ventes / toutes les ventes / ventes par produit
employee-report.html      bilan employé
accounting.html            bilan / facturation client / factures à payer / salaires / charges
hr.html                    personnel / archives / recrutement / services
roles.html                  gestion des rôles (le cœur du système de permissions)
announcements.html          menu annonces
company.html                inventaire / partenaires / banque / paramètres

assets/css/theme.css      variables de thème (couleurs, typo, arrondi)
assets/css/app.css        composants & mise en page
assets/js/config.js       tes identifiants Supabase (à remplir)
assets/js/supabaseClient.js
assets/js/auth.js         connexion / session / permissions effectives
assets/js/theme.js        moteur de thème
assets/js/sidebar.js      barre latérale + barre du haut, communes à toutes les pages
assets/js/ui.js           icônes, toasts, fenêtres modales, formatage
assets/js/pages/*.js      logique propre à chaque page

supabase/schema.sql        tables, sécurité (RLS), moteur de permissions, catalogue de départ
```

## Pistes d'amélioration

- Le format actuel privilégie plusieurs pages HTML plutôt qu'un seul
  fichier, pour garder chaque page légère à charger — dis-moi si tu
  préfères tout regrouper en un seul fichier comme tes autres interfaces.
- Le compte `raptor` / `admin` est créé directement dans le schéma
  d'authentification interne de Supabase — un procédé courant pour
  démarrer avec un compte prêt à l'emploi, mais qui reste "best effort"
  selon la version exacte de Supabase (détails et solution de repli dans
  `schema.sql`). Change son mot de passe dès la première connexion.
