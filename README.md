# Threadline — WhatsApp-style Real-Time Chat (Django + React)

- **Backend:** Django, Django REST Framework, Django Channels (+ Daphne)
- **Frontend:** React (Vite), React Router, React Icons
- **DB:** SQLite (development), PostgreSQL (Render) · **Real-time:** WebSockets (no polling anywhere)

```
whatsapp-clone/
├── backend/    Django project ("chatproject") + app ("chat")
└── frontend/   React app
```

## 1. Run it

**Terminal 1 — backend**
```bash
cd backend
python -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser    # optional (for /admin/)
python manage.py runserver 0.0.0.0:8000
```
You should see `Starting ASGI/Daphne ... development server at http://127.0.0.1:8000/`.
If it says "Starting development server" *without* "ASGI/Daphne", WebSockets
will NOT work — make sure `daphne` is installed and is the first entry of
`INSTALLED_APPS` (it already is in this project).

**Terminal 2 — frontend**
```bash
cd frontend
npm install
npm run dev                          # http://localhost:5173; also reachable on the LAN
```

To test from your phone/another PC on the same Wi-Fi:
open `http://<your-pc-ip>:5173` (find the PC's IPv4 address with `ipconfig`)
(the frontend automatically talks to `<same-host>:8000`; override with
`VITE_BACKEND_HOST` in `frontend/.env`).
Allow Node.js and Python through Windows Firewall on private networks if
prompted. Do not expose these development servers to untrusted networks.

If using a Dev Tunnel for the frontend, expose backend port `8000` through a
second HTTPS tunnel as well. A frontend tunnel URL ending in
`-5173.inc1.devtunnels.ms` is automatically mapped to the corresponding
`-8000.inc1.devtunnels.ms` backend URL. Ensure the backend tunnel is running
and permits the phone to access it; otherwise set `VITE_BACKEND_HOST` in
`frontend/.env` to the backend tunnel hostname (without `https://`), then
restart Vite.

## 2. Architecture

| Concern | Transport |
|---|---|
| Register / login / logout, user search, conversation list, message history | REST |
| New messages, typing, read & delivered ticks | WebSocket `ws/chat/<conversation_id>/` |
| Online/offline, last seen, "you have a new message" in any chat | WebSocket `ws/notifications/` |

Two sockets, on purpose:

1. **Notification socket** (one per logged-in user, whole session). Being
   connected = being online. It tells you about new messages in *any*
   conversation (so the chat list, unread badge and ordering update live even
   when that chat isn't open) and when your contacts go online/offline.
2. **Chat socket** (one per *open* conversation). Messages, typing indicator,
   read/delivered receipts, message deletions.

Auth: DRF token (`Authorization: Token …` for REST, `?token=…` for the
sockets, validated by `chat/middleware.py`). Unauthorized sockets are accepted
and immediately closed with code 4001, forbidden (not a member) with 4003 —
the frontend does not retry those. The **sender is always taken from the
authenticated socket**, never from client data; membership of the
conversation is verified on connect and on every send.

Message ticks: ✓ sent · ✓✓ delivered (receiver was online / came online) ·
blue ✓✓ read (receiver opened the chat).

## 3. Test checklist (two different browsers, or normal + Incognito)

1. Register **User A** in browser 1 and **User B** in browser 2.
2. A: search B in the sidebar → click → chat window opens. Send "Hello".
3. B: the conversation appears in the sidebar with an unread badge **without
   refresh** (even though B has no chat open). Open it → message is there, and
   A's tick turns blue.
4. Keep both chats open: messages arrive instantly both ways.
5. Typing: type in one browser → "typing..." in the other.
6. Online/last seen: close B's tab → A sees "last seen today at …"; reopen → "Online".
7. Delete a message (trash icon on your own bubble) → disappears for both.
8. Delete conversation (trash in header) → disappears for both.
9. Stop the Django server → pill shows "Reconnecting…" then "Offline" (click it to retry). Restart the server → reconnects and re-syncs missed messages.
10. Shrink the window below ~820px: list ↔ chat behave like WhatsApp (back arrow).
11. Enter sends, Shift+Enter inserts a new line.

## 4. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Pill stuck on "Reconnecting/Offline" | Backend not running as ASGI. Use `python manage.py runserver` and check the Daphne line in the console. |
| `no such table: chat_...` | Run `python manage.py migrate`. |
| Phone cannot open the app or login/register | Keep both devices on the same Wi-Fi; run Django with `python manage.py runserver 0.0.0.0:8000`, open `http://<your-pc-ip>:5173` on the phone, and check Windows Firewall. When using Dev Tunnels, expose backend port `8000` over HTTPS in a second tunnel. Do not set `VITE_BACKEND_HOST` to `127.0.0.1` or `localhost` for phone access; those addresses point to the phone itself. In DEBUG, all origins are allowed. |
| User shows online forever after a crash | Restart the dev server — presence is reset on startup in DEBUG. |

## 5. Deploy to Render

The root `render.yaml` Blueprint provisions an ASGI backend, PostgreSQL,
Redis, a persistent upload disk, and the static React frontend. Push this
repository to a Git provider, then select **New → Blueprint** in Render and
connect the repository. Render serves the frontend and API on separate
HTTPS origins; the Blueprint wires the API host, CORS origin, and WebSocket
scheme automatically.

The deployed PostgreSQL database starts empty; local SQLite users, messages,
and files are not copied automatically.

The backend runs Daphne (not Django's development server), uses Redis for
cross-process WebSocket events, PostgreSQL for application data, and
WhiteNoise for Django admin/static assets. The release step applies database
migrations. The `/health/` endpoint is used for backend health checks.

Profile/group images and message attachments are stored on a 1 GB persistent
Render disk mounted at `/var/data`. The backend serves those files, so this
single-instance disk setup is suitable for a small deployment; move media to
object storage before horizontal scaling or handling substantial uploads.
Render disks require a paid web-service plan and prevent scaling that service
to multiple instances.

After the first deploy:

1. Open the frontend's Render URL and register two accounts to test messaging.
2. Verify chat, presence, read receipts, and calls over HTTPS/WSS.
3. If you add a custom frontend domain, add its `https://` origin to both
   `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS`, and its hostname to
   `DJANGO_ALLOWED_HOSTS` on the backend (WebSocket origin validation uses it).
4. Configure backups and monitor database, Redis, and upload-disk usage.

Do not set `DJANGO_DEBUG=True` in production. The production settings require
a secret key, allowed host, PostgreSQL URL, and Redis URL; Django refuses to
start if critical settings are missing. Run `python manage.py check --deploy`
against the production environment when reviewing a release.

## 6. Production build checks

```bash
# Backend (from backend/)
python manage.py check
python manage.py test chat
python manage.py collectstatic --noinput

# Frontend (from frontend/)
npm ci
npm run build
```

For a frontend hosted outside Render, set the build-time variable
`VITE_API_BASE_URL=https://your-api.example.com/api`. The API origin must
allow the frontend's exact HTTPS origin, and its reverse proxy must support
WebSocket upgrades.
