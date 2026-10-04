# LS Customs — Management & Comptabilité

Application de gestion RP (point de vente, comptabilité, RH, stock) pour Los Santos Customs.
HTML/CSS/JS sans build : fonctionne en local, sur Vercel et dans une NUI FiveM.

## Lancer en local

Servir le dossier avec n'importe quel serveur statique, par exemple :

```bash
python -m http.server 5510
```

puis ouvrir http://localhost:5510. En mode local, la logique serveur tourne dans le navigateur et les
données sont stockées dans `localStorage`.

Connexion : Char ID + mot de passe (on arrive sur le Point de vente ; en rouvrant la page dans l'heure, on revient sur
la dernière page de la même personne). La base démarre vide : **le premier compte créé** (« Créer un compte ») devient PDG ;
les suivants apparaissent dans Personnel → Liste et doivent être validés par un Recruteur ou plus.
Sécurité : mots de passe de 6 caractères minimum, jamais affichés ni transmis à l'interface. 5 échecs → compte bloqué
15 min (Recruteur + peut le débloquer dans Personnel → Liste). DRH + peut réinitialiser un mot de passe : à la connexion
suivante avec ce Char ID, l'employé en choisit un nouveau (même chose pour un compte créé par la direction).

Licenciement (onglet du menu) : aide à la décision (salaire et prérequis des 2 dernières semaines), puis fenêtre d'étapes à
cocher — Company, Discord, Compta (dernier salaire réglé) — modifiables dans Paramètres → Licenciement. Quand tout est coché,
« Confirmer » envoie le message Discord et supprime le compte de la compta (plus d'accès ; historique gardé dans les archives).

Discord (Paramètres → Discord) : webhook des sorties de stock (par défaut, ou un webhook par produit dans sa fiche ;
une annulation envoie un retour) et rappel d'archivage en début de mois avec le rôle à pinger.
Aussi : logs des grosses ventes (seuil réglable) et des licenciements, et récap quotidien des factures en jeu
(API GLife `/roleplay/company/invoices`, entreprise 139 par défaut) ; le Bilan affiche ces factures par personnage.
La session dure 1 h : en rouvrant la page dans l'heure, on revient sur la dernière page ouverte.
« Créer un compte » (écran de connexion) : Prénom, Nom, Char ID et mot de passe obligatoires. La demande apparaît dans
Personnel → Liste (« Demandes de compte ») et le compte n'est actif qu'après validation par la direction (grade Apprenti).
Paramètres → Données permet de réinitialiser ou d'exporter.

Grades : direction (PDG > Co-PDG > DRH) > Chef d'équipe > Recruteur > CDI > CDD > Apprenti (rangs, salaires et permissions dans Rôles).

Plaques : le POS interroge l'API publique GLife (`GET https://apirp.glife.fr/roleplay/vehicles?plate=XXXX`, sans clé,
URL réglable dans `js/config.js` → `vehicleApi`). Elle renvoie le ou les véhicules de la plaque (choix du modèle s'il y en a plusieurs). La catégorie (1 à 5) n'est pas fournie : elle est reprise de l'historique de la plaque, sinon du
dernier véhicule du même modèle passé au garage, sinon choisie à la main.

Facturation : uniquement les partenaires (pas de fiche client). Une vente faite avec un partenaire est « à facturer » ;
dans Factures, « Générer la facture » regroupe ses ventes et l'envoie sur le webhook Discord du partenaire, en mentionnant
l'ID Discord et/ou l'ID de rôle renseignés dans sa fiche. Les factures personnalisées (lignes libres) restent possibles.

Thèmes : Sombre, Clair, Halloween et Noël (avec décorations animées). Le thème par défaut se règle dans Paramètres →
Entreprise ; chacun peut choisir le sien et couper les décorations (menu du profil → Thème, gardé dans son navigateur).

## Architecture

```
FiveM client (fivem/client.lua)  ->  NUI (index.html)  ->  LSC.api.call(action, payload)
        |                                                         |
        v                                                         v
FiveM server (fivem/server.lua) --x-lsc-server-key + licence-->  api/rpc.js (Vercel)
                                                                  |  js/core/server.js : permissions + calculs
                                                                  v
                                                             Supabase (lsc_state)
```

- `js/core/server.js` : **seule source de vérité**. Chaque action (vente, réduction, paie, stock...)
  vérifie les permissions et recalcule les montants depuis la base. L'UI n'envoie que des ID et des quantités.
- `js/core/seed.js` : catalogue de base + données de démo (produites en rejouant de vraies actions).
- `js/core/api.js` : transport `local` / `http` / `nui` (choisi dans `js/config.js`).
- `js/core/stats.js` : statistiques calculées (CA, bénéfice, séries, par produit, par employé).
- `js/ui/components.js` : Modal, Form, Table (tri + pagination), Toast, StatCard, Chart SVG, EmptyState, Skeleton...
- `js/pages/*` : pages (POS, comptabilité, RH, entreprise).

## Déploiement Vercel + Supabase

1. Supabase → SQL Editor : exécuter `supabase/schema.sql` (à relancer après une mise à jour : il est rejouable).
2. Vercel : importer ce dossier, puis définir les variables d'environnement :
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (jamais exposée au navigateur)
   - `LSC_SECRET` (chaîne aléatoire longue, signature des sessions web)
   - `LSC_FIVEM_KEY` (secret partagé avec le serveur FiveM)
   - facultatif : `LSC_OWNER_CHARID`, `LSC_OWNER_PIN` (mot de passe), `LSC_OWNER_FIRSTNAME`, `LSC_OWNER_LASTNAME`, `LSC_OWNER_LICENSE`
     pour créer le PDG dès le déploiement (sinon le premier compte créé sur le site devient PDG : créez-le tout de suite)
   - `LSC_SEED=demo` uniquement si vous voulez les données de démonstration au premier lancement
3. Dans `js/config.js`, passer `mode: 'http'`, puis redéployer.
4. `vercel.json` déclare une tâche quotidienne (`/api/rpc?ping=1`) qui garde Supabase actif (pause après 7 jours sans activité en gratuit).

Connexion web : Char ID + mot de passe (défini par la direction dans Liste du personnel, modifiable dans Mon compte). Session de 1 h renouvelée à chaque action.

## FiveM

Le dossier est directement une ressource (`fxmanifest.lua` à la racine). Dans `server.cfg` :

```
set lsc_api_url "https://votre-projet.vercel.app/api/rpc"
set lsc_server_key "même valeur que LSC_FIVEM_KEY"
ensure ls_customs
```

Ouverture : `/lscustoms` ou F7. À la première ouverture en jeu, l'employé se connecte une seule fois (Char ID + mot de
passe) : sa licence FiveM (fournie par le serveur, jamais par le client) est reliée à son compte, la tablette s'ouvre
ensuite directement. Le véhicule le plus proche est envoyé au POS (plaque, modèle, classe GTA).

Catégories de véhicules (1 à 5) : liste de la direction (834 modèles, `VEHICLES` dans `js/core/seed.js`, modifiable et importable
dans Paramètres → Catégories de véhicules). Le modèle vient de l'API GLife (plaque) ou du jeu ; la catégorie est
sélectionnée automatiquement, le choix manuel reste possible. Un modèle absent de la liste :
alerte « à vérifier en jeu » au POS, message Discord (une fois par modèle) et entrée « À recenser » dans Paramètres.

## Limites connues

- Stockage Supabase : `lsc_state` (document principal : réglages, comptes, grades, catalogue, paies, factures) +
  `lsc_rows` (une ligne par vente, commission, service, opération bancaire, entrée d'historique, mouvement de stock).
  Une action ne lit que le document + les éléments en cours + ce dont elle a besoin ; l'interface charge les 15 derniers
  jours puis l'historique à la demande. Écriture atomique via la fonction SQL `lsc_commit` (verrou optimiste).
  Une ancienne base « document unique » est découpée automatiquement au premier appel, sans perte.
- Archives mensuelles (Paramètres → Données, PDG) : téléchargement JSON d'un mois terminé puis suppression.
  Comptes, grades, produits, partenaires et réglages ne sont jamais supprimés ; le solde bancaire reste exact.
  Supabase gratuit n'a pas de sauvegarde automatique des lignes : ces fichiers servent aussi de sauvegarde.
- Images produits : miniatures 320 px dans `img/products/` (générées depuis `logo items/`). Pour un nouvel
  article, déposer un PNG dans `img/products/` puis saisir `img/products/nom.png` dans sa fiche (ou une URL).
  Les dossiers `logo/` et `logo items/` (originaux, ~50 Mo) ne sont pas utilisés par l'application.
- Les charges « récurrentes » sont marquées comme telles ; le bouton Dupliquer crée la nouvelle échéance.
