# Déploiement du backend PharmaStock sur Railway

Ce guide décrit comment déployer le backend sur [Railway](https://railway.app) sans blocage.

## Checklist avant déploiement

- [ ] **Root Directory** du service = `backend`
- [ ] **PostgreSQL** ajouté au projet, `DATABASE_URL` référencée dans les Variables du service
- [ ] **JWT_SECRET** défini dans les Variables (ex. `openssl rand -hex 32`)
- [ ] **CORS_ORIGIN** défini si vous avez un frontend (URL exacte, sans slash final)
- [ ] Après le premier déploiement : `railway run npm run init-db` pour créer les tables et données de démo

## Prérequis

- Compte [Railway](https://railway.app)
- Projet Git (GitHub, GitLab, etc.) avec le dépôt pharma-stock

## 1. Créer un projet Railway

1. Sur [railway.app](https://railway.app), **New Project**.
2. **Deploy from GitHub repo** → choisir le dépôt `pharma-stock`.
3. Railway crée un **service** à partir du dépôt.

## 2. Configurer le service backend

1. Cliquer sur le service créé.
2. **Settings** → **Root Directory** : définir `backend` (pas la racine du repo).
3. **Settings** → **Build Command** : laisser vide (Railway utilise `npm install` par défaut).
4. **Settings** → **Start Command** : laisser vide (Railway utilise `npm start`).
5. **Settings** → **Watch Paths** (optionnel) : `backend/**` pour ne redéployer que si `backend/` change.

## 3. Ajouter PostgreSQL

1. Dans le même projet : **+ New** → **Database** → **PostgreSQL**.
2. Railway crée une base et injecte automatiquement **`DATABASE_URL`** dans les variables d’environnement.
3. Lier la base au service backend :
   - Ouvrir le service backend → **Variables**.
   - **+ Add Variable** → **Add Reference** → choisir la variable `DATABASE_URL` du service Postgres.

Le backend utilise `DATABASE_URL` en priorité ; rien d’autre n’est nécessaire pour la DB.

## 4. Variables d’environnement obligatoires

Dans le service backend → **Variables**, ajouter :

| Variable       | Obligatoire | Description |
|----------------|-------------|-------------|
| `JWT_SECRET`   | **Oui**     | Clé secrète pour les JWT (ex. `openssl rand -hex 32`). |
| `DATABASE_URL` | **Oui**     | Référence au Postgres Railway (voir étape 3). |
| `PORT`         | Non         | Fourni par Railway. Ne pas modifier. |
| `CORS_ORIGIN`  | Non         | URL(s) du frontend, séparées par des virgules (ex. `https://mon-app.vercel.app`). |

Sans `JWT_SECRET`, l’app ne démarre pas (message d’erreur au boot).

## 5. Déployer

1. **Deploy** (ou push sur la branche connectée).
2. Attendre la fin du build et du déploiement.
3. **Settings** → **Networking** → **Generate Domain** pour obtenir une URL publique (ex. `xxx.up.railway.app`).

L’API est disponible sur `https://<votre-domaine>/api` (ex. `https://xxx.up.railway.app/api`).

## 6. Initialiser la base de données

La base Railway est vide. Il faut créer les tables et les données de démo une fois :

**Option A – Railway CLI**

```bash
cd backend
npm install -g @railway/cli
railway login
railway link   # choisir le projet + service backend
railway run npm run init-db
```

**Option B – One-off sur Railway**

1. **Settings** → **Deploy** → **One-off command** (si disponible).
2. Ou depuis un terminal local avec Railway CLI : `railway run npm run init-db`.

Après `init-db`, les comptes de démo sont disponibles (voir README).

## 7. Vérifications

- **Healthcheck** : `GET https://<votre-domaine>/api/health` → `{ "status": "OK", ... }`.
- **Logs** : dans Railway → onglet **Deployments** → **View Logs**.
- **Variables** : `DATABASE_URL` et `JWT_SECRET` bien définis, pas de valeur vide.

## 8. Frontend

Configurer le frontend pour appeler l’API Railway :

- Remplacer `http://localhost:5000` par `https://<votre-domaine>` (ou la variable d’env utilisée côté frontend).
- Ajouter l’URL du frontend dans `CORS_ORIGIN` du backend (ex. `https://mon-app.vercel.app`).

## Dépannage

| Problème | Piste |
|----------|--------|
| `Missing DB config` au démarrage | Vérifier que `DATABASE_URL` est bien référencée dans les Variables du service backend. |
| `JWT_SECRET is required` | Ajouter `JWT_SECRET` dans Variables. |
| `CORS` / requêtes bloquées | Renseigner `CORS_ORIGIN` avec l’URL exacte du frontend (et pas de slash final). |
| Healthcheck en échec | Vérifier que l’app écoute sur `PORT` et que `/api/health` renvoie 200. |
| `init-db` échoue | Vérifier que `DATABASE_URL` est dispo dans l’env du one-off (`railway run` utilise le même env que le service). |

## Fichiers utiles dans `backend/`

- `railway.toml` : healthcheck `/api/health`, politique de redémarrage.
- `.env.example` : modèle de variables (local + Railway).
- `config/database.js` : utilise `DATABASE_URL` (Railway) ou `DB_*` (local).
