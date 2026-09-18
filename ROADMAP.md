# Roadmap — Los Santos Customs Compta

Basé sur tes captures. Rien de tout ça n'est encore construit — c'est la
liste à prioriser ensemble avant de s'y mettre.

---

## 🐛 En attente de diagnostic

- **Commission / "toujours le prix usine" en Point de vente** — toujours
  pas reproduit malgré 4 relectures du code. En attente de tes deux
  captures (panier avec un article + partenaire choisi, et le formulaire
  d'ajout d'un produit).

## ✅ Fait ce tour-ci

- **Changement de catégorie plus rapide** — avant, chaque produit créait
  son propre élément HTML et son propre écouteur de clic un par un ;
  maintenant toute la grille se construit en un seul bloc avec un seul
  écouteur partagé. Devrait se sentir instantané même avec un gros
  catalogue.

---

## 📋 À construire (d'après tes captures)

### 1. Paramètres entreprise → passer en onglets
Aujourd'hui tout est sur une seule page. Tes captures montrent une
structure en onglets à reproduire :
- **Général** : nom, **compte bancaire de l'entreprise**, **logo réel**
  (upload JPG/PNG/WEBP, pas juste un emoji) affiché sur les factures
  partenaires, **webhook Discord** pour recevoir les factures fournisseurs
  directement dans un salon Discord.
- **Ventes** : réglages par défaut ("Demander le nom du client" — activable
  aussi au cas par cas sur un produit précis).
- **Services** : équivalent pour les services.
- **Annonces** : réglages du module annonces.
- **Taxes** : page dédiée pour configurer les taxes, plutôt qu'un taux
  produit par produit uniquement.
- **Primes** : déjà commencé (primes récurrentes) — à enrichir.
- **Fidélité** : programme de fidélité client — module entièrement nouveau.
- **Tombola** : système de tombola/loterie — module entièrement nouveau.

### 2. Gestion des rôles → modèle plus riche
Ton système actuel de rôles (permissions à la Discord) reste, mais tes
captures montrent des colonnes en plus à ajouter à chaque rôle :
- **Type de contrat** (Direction / CDI / CDD / Période d'essai)
- **Norme salariale (%)** — un pourcentage utilisé dans le calcul du
  salaire (à définir précisément ensemble : appliqué sur quoi ?)
- **Limites salariales** — un plafond et/ou un minimum
- Tableau triable par colonne, avec un menu d'actions "..." par ligne

### 3. Gestion des stocks → produits à paliers
Tes captures montrent des produits avec **plusieurs paliers** (ex: "Freins
Tuné" décliné en 5 niveaux, prix croissant), avec un **prix d'achat**
distinct du **prix de vente**, et un statut de stock ("Non géré" = illimité,
ou géré avec une quantité qui se décrémente). Mon système actuel a un seul
niveau par produit — il faudrait soit des variantes liées à un même
produit, soit simplement plusieurs produits nommés pareil avec un numéro
de palier, comme sur tes captures.

### 4. Création de compte employé par un admin
Aujourd'hui, seule l'auto-inscription existe (limite technique : Supabase
ne permet pas de créer un compte pour quelqu'un d'autre depuis le
navigateur sans exposer une clé secrète). Un vrai flux "un admin crée le
compte et pré-remplit toutes les infos" demande une petite fonction
serveur (Supabase Edge Function) qui garde cette clé côté serveur,
jamais dans le code du site. C'est faisable, mais c'est un chantier à part
plutôt qu'une simple modif de formulaire.

---

## Mon avis sur l'ordre

Je mettrais **Gestion des rôles enrichi** et **Stocks à paliers** en
premier — ce sont des fondations que "Taxes", "Fidélité" et "Tombola"
viendront probablement réutiliser. Dis-moi si tu vois ça autrement, et
lequel de ces chantiers tu veux qu'on attaque en premier.
