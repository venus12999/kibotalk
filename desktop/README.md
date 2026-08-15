# KiboTalk desktop (closed beta)

The site still needs the cloud APIs for speech and suggestions, so this folder is a thin Electron window around the hosted app — not an offline copy of the backend.

Default URL: `https://kibotalk.lovable.app`  
Override: `KIBOTALK_URL=https://kibotalk.superpowerlulu.win npm start`

## Run locally (unsigned)

```sh
cd desktop
npm install
npm start
```

If `npm install` hangs while downloading Electron (common on some networks), use a mirror then start:

```sh
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
npm start
```

Point it at your local web server:

```sh
KIBOTALK_URL=http://localhost:8080 npm start
```

## Build installers on your Mac

```sh
cd desktop
npm install
npm run dist:mac
```

Installers land in `desktop/dist/`:

- `KiboTalk-mac-arm64.dmg` — Apple Silicon
- `KiboTalk-mac-x64.dmg` — Intel

macOS will warn that the app is from an unidentified developer. Testers should Control-click the app in Finder and choose **Open**.

Windows installers are built on GitHub Actions (`KiboTalk-win-x64.exe`).

## Publish a downloadable release

1. Commit the desktop folder to `main`.
2. Tag and push:

```sh
git tag desktop-v0.1.0
git push origin desktop-v0.1.0
```

3. GitHub Actions builds Mac + Windows and attaches files to that tag.
4. The landing page (`/` when logged out, or `/download`) reads the latest GitHub release and shows the matching download button.

Apple notarization is not set up yet. Do that later with a Developer ID if you want testers to skip the Control-click step.
