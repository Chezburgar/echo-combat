# ECHO COMBAT

Zero-gravity multiplayer VR robot combat in the browser — WebXR + desktop.
Inspired by Echo VR: booster movement, grab **everything**, fling yourself
through tunnels, last robot flying wins.

## Run it

```
npm install
npm start
```

Open **http://localhost:8080** — every browser tab / PC on your LAN that
connects is another player in the same station.

## Deploy online (Render)

The repo ships a `render.yaml` blueprint that runs the full Node multiplayer
server (WebSockets included) on Render's free tier:

1. Go to **https://render.com/deploy?repo=https://github.com/Chezburgar/echo-combat**
   (or Render dashboard → New → Blueprint → pick this repo).
2. Accept the defaults and deploy.
3. Share your `https://echo-combat-xxxx.onrender.com` URL — everyone who opens
   it is in the same lobby, and HTTPS means VR headsets can join directly
   from the headset browser.

Note: the free tier spins down when idle — the first visit after a quiet
period takes ~30–60 s to wake. If the game can't reach the server it falls
back to **offline mode** (lobby + VS BOTS still work); refresh once the
service is awake for multiplayer.

## Play

- **Lobby**: zero-g hangar. Fly around, talk (proximity voice), then use the
  three terminals by the big door:
  - **MATCHMAKING** — queue up; a battle royale launches when 2+ pilots are ready.
  - **PRIVATE** — create a party (4-digit code), friends join with the code,
    host can add bots and launch.
  - **VS BOTS** — instant solo battle royale against AI pilots.
- **Match**: free-for-all battle royale in a huge multi-chamber station.
  20 damage per hit, 100 hull. Eliminated → back to the lobby. Last one flying wins.

### Desktop controls
| Input | Action |
| --- | --- |
| Mouse | Look (click once to capture the cursor) |
| WASD + Space/Ctrl | Boosters |
| Shift | Boost (drains meter) |
| X | Brake |
| E | Grab nearest surface / release |
| Space (while grabbed) | Push off in view direction |
| Left click | Fire (in match) / press terminal buttons (in lobby) |
| V | Toggle mic |

### VR controls (Quest, Index, etc.)
| Input | Action |
| --- | --- |
| Left stick | Thrust (head-relative) |
| Right stick | Up/down + snap turn |
| **Grip** near any surface | Grab — move your hand to fling yourself |
| Both grips (open space) | Brake |
| Trigger | Fire / point-and-click terminals |
| A / X | Boost |

## VR on a standalone headset (Quest)

WebXR requires HTTPS for non-localhost origins. Two easy options:

1. **Link/Air Link or Virtual Desktop**: open `http://localhost:8080` in the
   PC browser and enter VR — no cert needed.
2. **Standalone over LAN**: create a self-signed cert, then browse to
   `https://<your-pc-ip>:8443` from the headset browser:
   ```
   mkdir certs
   openssl req -x509 -newkey rsa:2048 -nodes -keyout certs/key.pem -out certs/cert.pem -days 365 -subj "/CN=echo-combat"
   ```
   (restart the server; accept the certificate warning on the headset)

## Tech

- Three.js (WebXR), no build step — ES modules + import map
- Node + `ws` server: rooms, matchmaking, parties, battle-royale authority
- WebRTC mesh proximity voice with positional audio (HRTF panners)
- All textures and sounds are procedural — zero binary assets
