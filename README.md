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
   exécute-le. Ça crée toutes les tables, la sécurité (RLS) et le moteur de
   permissions.
3. Va dans **Authentication → Settings** et **désactive "Confirm email"**
   (Enable email confirmations = OFF). C'est obligatoire ici : aucun compte
   n'utilise une vraie adresse email (voir plus bas), donc un email de
   confirmation ne pourrait jamais arriver.
4. Va dans **Project Settings → API** et note :
   - **Project URL**
   - **anon public key** (ou la nouvelle clé **publishable**, ça marche pareil)

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

1. Ouvre le site → onglet **Créer un compte** → inscris-toi avec le nom
   d'utilisateur **`raptor`**, mot de passe **`admin`** (+ ID personnage,
   téléphone `555-...` et numéro de compte, au choix). **Étant le tout
   premier compte de l'entreprise, il devient automatiquement Patron**,
   avec toutes les permissions, et seed le catalogue de départ (Services /
   Customs / Ventes / Peinture).
2. Change ce mot de passe dès que possible depuis le menu de profil (en bas
   de la barre latérale) ▸ *Mot de passe*.
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
  table `product_categories`. Quiconque a la permission "Gérer les
  paramètres" voit un bouton **✎ Éditer** directement dans le Point de
  vente : il permet d'ajouter/modifier/supprimer les produits de l'onglet
  ouvert, et de gérer les **étiquettes** (sous-catégories, ex. "Apparence" /
  "Performance") — renommer une étiquette met à jour tous les produits qui
  l'utilisent. La même chose reste aussi disponible depuis **Mon
  entreprise ▸ Paramètres ▸ Catalogue produits**.
- Chaque produit a : **Prix** (facturé au client, 0 = gratuit), **Prix
  usine** (son coût, 0 = aucun), un **Taux de taxe** (%, 0 = aucune) et un
  interrupteur **Paiement direct à l'employé**.
- Un **partenaire** appliqué au panier calcule automatiquement une
  **commission** (%) affichée à part.
- **Réduction** / **Majoration** ouvrent une petite fenêtre pour appliquer
  un pourcentage ou un montant fixe au total (0 = aucune).

### Chiffre d'affaires vs salaire

Quand un produit est marqué **"Paiement direct à l'employé"** (coché par
défaut — ex. une Carrosserie à $50 que le jeu paie directement au joueur),
sa vente :
- compte normalement dans le **chiffre d'affaires** (Bilan, dashboard,
  Ventes par produit) ;
- compte aussi dans les **taxes** si le produit a un taux de taxe fixé ;
- mais ne rajoute **rien** au salaire à verser — l'employé a déjà été payé.

Si tu décoches "Paiement direct", le montant reste dû par l'entreprise et
s'additionne dans la fiche de paie de l'employé. Dans **Comptabilité ▸
Salaires ▸ Nouvelle fiche de paie**, le bouton **↻ Calculer depuis les
ventes** remplit automatiquement le chiffre d'affaires (toutes les ventes
de la semaine) et le salaire brut (seulement la part encore due) pour
l'employé et la semaine choisis — à ajuster ensuite si besoin (primes,
avances...).

Si tu as déjà rejoué l'appli avant cette mise à jour, l'app corrige aussi
automatiquement, à la prochaine connexion, tout compte qui se retrouverait
sans fiche employé liée (ça pouvait arriver avec des comptes créés à la
main par SQL) — c'était la cause probable d'une Prise de service qui ne
réagissait pas.

### Quota et primes récurrentes

Dans **Mon entreprise ▸ Paramètres** :
- **Quota hebdomadaire** : objectif de chiffre d'affaires par employé et
  par semaine (0 = aucun quota). Affiché avec une barre de progression
  dans **Comptabilité ▸ Salaires**.
- **Primes récurrentes** : des montants réutilisables (prime de
  recrutement, de classement...) que tu ajoutes en un clic dans une fiche
  de paie au lieu de retaper un chiffre à chaque fois.

## Recherche de véhicule (API GLife)

Le champ **Plaque** du Point de vente a un bouton 🔍 qui va chercher le
véhicule et son propriétaire sur `api.glife.fr` (nom, propriétaire, statut
illégal). Ça passe par une petite fonction serveur (`api/vehicle-lookup.js`)
plutôt qu'un appel direct depuis le site, pour garder ta clé API secrète et
éviter les soucis CORS.

Pour l'activer :
1. Sur Vercel : **Settings ▸ Environment Variables** → ajoute
   `GLIFE_API_KEY` avec ta vraie clé → redéploie.
2. Vérifie le format d'authentification attendu par l'API (bouton
   "Authorize" sur `api.glife.fr/docs`). Le fichier suppose
   `Authorization: Bearer <clé>` — si GLife attend autre chose (un header
   personnalisé par exemple), change la ligne `headers` dans
   `api/vehicle-lookup.js`.

Sans cette variable configurée, le bouton affiche juste une erreur — le
reste du site fonctionne normalement.

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
api/vehicle-lookup.js      fonction serveur Vercel — recherche de véhicule (API GLife)
```

## Pistes d'amélioration

- Le format actuel privilégie plusieurs pages HTML plutôt qu'un seul
  fichier, pour garder chaque page légère à charger — dis-moi si tu
  préfères tout regrouper en un seul fichier comme tes autres interfaces.
- Pas de compte pré-inséré par SQL : sur les projets Supabase hébergés, le
  SQL Editor ne peut généralement pas écrire directement dans les tables
  internes `auth.users` / `auth.identities` (Supabase les protège), donc ce
  genre d'insertion échoue silencieusement. Le chemin fiable reste de
  s'inscrire une fois via **Créer un compte** — le tout premier compte
  devient Patron automatiquement.
