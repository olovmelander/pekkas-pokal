# 🏆 Pekkas Pokal

Den årliga tävlingen mellan vänner sedan 2011 — resultat, medaljliga, historik,
utmärkelser och statistik.

**Live:** https://olovmelander.github.io/pekkas-pokal/

---

## Uppdatera sidan

Allt innehåll styrs av två filer. Du kan redigera båda direkt på GitHub i
webbläsaren — sidan bygger och publicerar sig själv inom ett par minuter när du
sparar till `main`.

### 1. Lägg till resultat efter en tävling

Fil: [`competition-data.csv`](competition-data.csv)

Lägg till en rad längst ned. Kolumnerna är:

```
År,Datum,Tävling,Plats,Arrangör 3:a,Arrangör näst sist,<en kolumn per deltagare>
```

Exempel:

```csv
2026,2026-08-06,Padel,Barcelona,Per Olsson,Per Vikman,3,7,1,5,...
```

Regler:

- **Placering** skrivs som en siffra (`1` = vinnare). Lämna tomt eller skriv `-`
  för den som inte deltog.
- **Datum** i formatet `ÅÅÅÅ-MM-DD`. Kan lämnas tomt.
- **Plats** måste matcha en plats i kartan för att få en nål — se
  `LOCATION_COORDS` i [`src/scripts/app.js`](src/scripts/app.js) om du behöver
  lägga till en ny ort.
- **Ny deltagare?** Lägg till en ny kolumn längst till höger med personens fulla
  namn i rubrikraden. Allt annat — medaljliga, utmärkelser, Elo, statistik —
  räknas om automatiskt.

### 2. Annonsera nästa tävling

Fil: [`public/event.json`](public/event.json)

```json
{
  "date": "2027-08-14T12:00:00",
  "location": "Örnsköldsvik",
  "coords": [63.29, 18.71],
  "hosts": ["Förnamn Efternamn", "Förnamn Efternamn"],
  "note": ""
}
```

- `date` styr nedräkningen. På tävlingsdagen räknar klockan ned i timmar,
  minuter och sekunder, och när starttiden passerats byter kortet till
  "pågår". Ett dygn efter start går sidan tillbaka till automatisk prognos.
- Sätt `"date": null` för att stänga av annonseringen helt.
- `coords` (valfritt) sätter ut en pulserande nål på kartan.

### 3. Lägg till foton

Lägg en bild i [`public/photos/`](public/photos/) med årtalet som filnamn:

```
public/photos/2025.jpg
public/photos/2024.jpg
```

Bilden dyker upp automatiskt högst upp på det årets kort i Historik och i
resultatrutan. Saknas en bild händer ingenting — inget att konfigurera.
Liggande format och ca 1200 px bredd fungerar bäst.

### 4. Spel

Fliken **Spel** innehåller ett spel per år. 2025 är *Pekkas Pokal Flipper* — ett
flipperspel i Three.js som byggs helt i webbläsaren (ingen bild- eller
ljudfil laddas ner, bara Three.js självt, och först när man öppnar spelet).

Att lägga till ett nytt års spel:

1. Skapa modulen under `src/games/<spel>/index.js` och exportera en funktion
   `createX(container, opts)` som returnerar `{ destroy() }`.
2. Lägg till en rad i `GAMES` i [`src/scripts/app.js`](src/scripts/app.js) med
   `year`, `title`, `tagline`, `icon` och sökvägen i `module`.

År utan spel visas automatiskt som "inte byggt än".

**Kontroller i flipperspelet**

| | Mobil | Dator |
| --- | --- | --- |
| Flippers | Vänster/höger halva av skärmen (fungerar samtidigt) | ←/→, A/D eller Z/M |
| Avfyrare | Håll för kraft, släpp för att skjuta | Mellanslag |
| Nudga | Knappen NUDGA | N |

Släpp avfyraren när mätaren står i det turkosa fältet för en **skill shot**.
Fyra nudgar för snabbt ger TILT och dödar flipprarna för den bollen.

---

## Utveckling

```bash
npm install
npm run dev      # lokal server på http://localhost:8000
npm run build    # produktionsbygge till dist/
npm run lint     # ESLint
```

### Struktur

| Fil | Ansvar |
| --- | --- |
| `index.html` | All markup, de fem vyerna och modalen |
| `src/scripts/app.js` | Hela applikationen: dataladdning, statistik, Elo, rendering |
| `src/scripts/achievement-engine.js` | Beräknar vilka utmärkelser varje deltagare låst upp |
| `src/data/achievements.js` | Definitioner av alla utmärkelser |
| `src/styles/` | `main` (tokens/teman), `layout`, `components`, `animations`, `games`, `responsive` |
| `src/games/pinball/` | Flipperspelet: `physics` (2D-kollision), `table` (layout + banans grafik), `meshes` (3D), `index` (spelloop) |
| `public/` | Statiska filer: `event.json`, `manifest.json`, ikoner, `og-image.png`, `photos/` |

Data hämtas från `competition-data.csv` vid sidladdning. Om filen inte går att
läsa faller appen tillbaka på en inbäddad kopia i `app.js`, så sidan visar alltid
något.

### Så räknas Elo

Varje tävling behandlas som en serie dueller: alla par av startande jämförs, och
den som placerat sig högst vinner duellen. Alla börjar på 1500 och varje par är
värt `K/(n−1)`, vilket gör att ett år med tolv deltagare inte kan svänga
ratingen mer än ett år med tre.

### Deploy

Push till `main` kör [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
som bygger projektet och publicerar till GitHub Pages. Inget manuellt steg behövs.

<!-- Deploy retrigger: 2026-08-06T18:40:05Z -->
