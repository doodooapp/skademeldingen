# Skademelding-app

Fyller ut det offisielle norske skademeldingsskjemaet og genererer en ferdig PDF.

## Deploy til Railway (5 minutter)

1. Push til GitHub
2. Gå til railway.app → New Project → Deploy from GitHub
3. Velg dette repoet
4. Railway bygger og deployer automatisk via Dockerfile
5. Klikk på det genererte domenet — appen kjører

## Lokal kjøring

Krev at pdftk er installert (`brew install pdftk-java` på Mac, `apt install pdftk` på Linux).

```bash
cd server
npm install
node index.js
```

Åpne http://localhost:3000

## Struktur

```
├── Dockerfile          # Railway bruker denne
├── public/
│   └── index.html      # Frontend-appen
└── server/
    ├── index.js        # Express-server, fyller PDF via pdftk
    ├── package.json
    └── skjema.pdf      # Det offisielle skjemaet
```
