# Deploying YUMA-Tracker on Dokploy

## Files Overview

| File | Purpose |
|------|---------|
| `backend/Dockerfile` | Python 3.12 image running uvicorn on port 18080 |
| `frontend/Dockerfile` | Multi-stage: Node 22 build → nginx serving static + proxy |
| `frontend/nginx.conf` | nginx config: serves frontend, proxies `/api/` and `/ws/` to backend |
| `docker-compose.yml` | Orchestrates both services for Dokploy |
| `.dockerignore` files | Excludes `node_modules`, `__pycache__`, `.env`, certs from builds |

## Architecture in Production

```
Internet → Traefik (Dokploy) → nginx (frontend container, port 80)
                                  ├── Static files (React app)
                                  ├── /api/* → proxy to backend:18080
                                  └── /ws/*  → proxy to backend:18080 (WebSocket upgrade)
```

---

## Step-by-Step Guide

### 1. Push Your Repo to GitHub/GitLab/Gitea

Make sure all the deployment files (`Dockerfile`s, `docker-compose.yml`, `nginx.conf`, `.dockerignore` files) are committed and pushed.

### 2. Install Dokploy on Your Server

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Access the Dokploy panel at `http://your-server-ip:3000` and create your admin account.

### 3. Connect Your Git Provider

Go to **Settings → Git Sources** and connect your GitHub/GitLab/Gitea account.

### 4. Create a Project

1. Click **Projects → Create Project**
2. Give it a name (e.g. `YUMA Tracker`)

### 5. Create a Docker Compose Service

1. Inside your project, click **Create Service → Compose**
2. Select **Docker Compose** as the type
3. Set **Provider**: GitHub (or Git)
4. Select your repository and branch (e.g. `main`)
5. Set **Compose Path** to `./docker-compose.yml`
6. Click **Save**

### 6. Set Environment Variables

Go to the **Environment** tab and add your mower credentials:

```
MAMMOTION_EMAIL=your_email
MAMMOTION_PASSWORD=your_password
```

These will be written to `.env` and loaded by the backend via `env_file` in the compose file.

### 7. Add a Domain

Go to the **Domains** tab:

1. Click **Add Domain**
2. **Host**: Enter your domain (e.g. `mower.example.com`) or use a free `traefik.me` domain
3. **Service Name**: Select `frontend`
4. **Container Port**: `80`
5. **HTTPS**: Toggle on (uses Let's Encrypt automatically)
6. Save

> If using a custom domain, create an **A record** in your DNS provider pointing to your server's IP.

### 8. Deploy

Click **Deploy** on the General tab. Watch the deployment logs — Dokploy will:

1. Clone your repo
2. Build both Docker images
3. Start the containers
4. Traefik will route your domain to the frontend nginx container

### 9. Verify

Visit your domain. The frontend loads from nginx, and all `/api/*` and `/ws/*` requests are proxied to the backend container internally.

---

## Optional: Auto-Deploy on Push

In the **Deployments** tab, you'll find a **Webhook URL**. Add it to your GitHub repo under **Settings → Webhooks** to auto-deploy on every push.
