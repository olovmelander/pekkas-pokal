# Arkaden 2011–2026

Alla 15 genomförda tävlingsår har nu ett spel. De åtta nya spelen täcker
2011–2018. 2020 var inställt och har inget spel. År, plats och deltagarnamn
kommer från `competition-data.csv`; påhittade delgrenar och förkortade
regelverk markeras som arkadtolkningar i spelen.

| År | Spel | Gameplay | Research och avgränsningar |
| --- | --- | --- | --- |
| 2011 | Pekkas Fantasy | Fem spelare, budget, kaptensval, byten och fem omgångar mot tre managers | [Fantasy](../src/games/fantasy/research.md) |
| 2012 | Pekkas Gokart | Tre varv mot fem rivaler, gas, broms, kurvgrepp och omkörningar | [Gokart](../src/games/kart/research.md) |
| 2013 | Pekkas Femkamp | Ringkast, häcklöpning, prickkast, längdhopp och balans | [Femkamp](../src/games/pentathlon/research.md) |
| 2014 | Pekkas Parkmästare | Boule, krocket och ringkast i en parkturnering | [Uppsala](../src/games/uppsala/research.md) |
| 2015 | Pekkas Bondespel | Luftgevärsskytte, vedstapling på tid, stövelkast, hästskokast och snabb spikning | [Bondespelen](../src/games/farm/research.md) |
| 2016 | Pekkas Gårdskamp | Kubbprecision, korgkast med vind och stockbalans | [Lundqvist](../src/games/lundqvist/research.md) |
| 2017 | Pekkas Triathlon | Simning, löpning och cykling med gemensam energi och tre olika banutmaningar | [Triathlon](../src/games/triathlon/research.md) |
| 2018 | Pekkas Ambition | Tre givar med kortbyte, färgtvång, tvåans specialregel och taktisk stickpoäng | [Ambition](../src/games/ambition/research.md) |

## Gemensamt format

Spelen använder samma Three.js r187, svenska gränssnitt, förgyllda typografi,
helskärmsvy, hashadresser och `create(container, opts) → { destroy() }` som de
befintliga spelen. Korten i arkaden visar stillbilder från själva spelen.
Alla modeller och ljud skapas i webbläsaren; inget bildpaket behövs under spel.
Three.js laddas som tidigare från CDN i den publicerade versionen.

`src/games/shared/arcade.js` sköter renderingslivscykel, storleksändring,
ljud av/på, paus, fokusförlust, lokal rekordsparning och resursstädning.
Det bygger på spelens befintliga grafikskydd. Tunga efterbehandlingseffekter
undviks; pixeltätheten begränsas på telefon och sänks vid ihållande låg
bildfrekvens. `?gfx=safe#/spel/2012` stänger av skuggor och antialiasering.

`arcade.css` ger en gemensam grund, men varje spel äger sin grafik,
spelmekanik, instruktioner och responsiva kontroller. Spelen har
pekknappar samt tangentbord. P pausar; Escape stänger spelet via webbplatsen.
Hållna kontroller släpps vid paus, fokusförlust och avbrutna pekgester.
Kort- och managerspel använder riktiga fokusbara HTML-knappar för läsbarhet.

## Historisk precision

Källorna belägger spelens förlagor och grundregler, inte vad som hände under
varje vänskapstävling. Bondespelens fem delgrenar och triathlons ordning bygger på användarens
uppgifter. De övriga mångkampernas ursprungliga delgrenar och Ambitions
husregler är inte dokumenterade i repositoriet. Miljöerna är konstnärliga
tolkningar. Fantasy använder påhittade fotbollsspelare och simulerade matcher,
inte liveinformation eller en rekonstruktion av säsongen 2011.
Respektive researchfil skiljer källunderlag från våra egna designbeslut.

## Köra och kontrollera

```sh
# Node.js 20 eller senare
npm ci
npm run dev
npx vitest run
npm run test:games
npm run build
npm run preview
```

Browserkontrollen använder Playwright. Installera Chromium med
`npx playwright install chromium`, eller ange `CHROMIUM_PATH` till en befintlig
Chromium. Den kontrollerar alla åtta nya spel på dator (1280×800), stående
telefon (390×844) och liggande telefon (844×390): start, synlig spelvärld,
paus med knapp och tangentbord, återupptagning, sidbredd och avmontering.
Skärmbilder sparas under ignorerade `scratchpad/arcade-checks/` för visuell granskning.

```sh
GAME_YEARS=2018 GAME_PROFILES=phone npm run test:games
GAME_URL=http://localhost:8080/pekkas-pokal/ npm run test:games
```

Enhetstesterna täcker poängregler, lagbudget, tillåtna kort, kompletta
AI-givar, kurvtagning, energi, precisionskast och katalogens koppling till
alla tävlingsår. Browserkontrollen kompletterar reglerna; den är ingen mätning
av prestanda på fysisk telefon eller verifiering av Safari/iOS. Spelen ska
också provspelas på riktiga enheter före publicering.

Vite-bygget kopierar de dynamiska spelmodulerna, deras CSS och tävlingsdata,
så `npm run preview` använder samma kompletta innehåll som GitHub Pages.
GitHub Actions behåller sin befintliga publiceringskedja.
