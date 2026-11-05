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
| 2019 | Pekkas Pingis | Servar, skruv och bollväxlingar genom en turnering | Ursprungligt spel, uppdaterad pekstyrning och spinnåterkoppling |
| 2021 | Pekkas Måleri | Blanda pigment, måla tre verk och få juryns bedömning | Ursprungligt spel, förbättrad palett, paus och mobilvy |
| 2022 | Pekkas Skytte | Lerduvor, framförhållning och precision i en skjutserie | Ursprungligt spel, tangentbordssikte och pausade fördröjningar |
| 2023 | Pekkas Fäktning | Gardering, finter, parader och riposter | Ursprungligt spel, korrigerad AI-fint och tydligare öppningsfönster |
| 2024 | Pekkas Fiske | Välj väg på djupet, bygg multiplikator och fånga fisken i tunnan | Ursprungligt spel, rättade bonusar, fångstflöde och paus |
| 2025 | Pekkas Flipper | Fäll mål, välj grenar, lås bollar och spela multiball | Ursprungligt spel, samordnad aktiv speltid och robust flipperstyrning |
| 2026 | Pekkas Lerskulptur | Forma, glätta, bränn och få keramik bedömd | Ursprungligt spel, tangentbordsdrejning och nästa-stjärna-guide |

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
pekknappar samt tangentbord. P pausar. Escape stänger först lokal hjälp eller
paus i de äldre spelen; annars stängs spelet via webbplatsen.
Hållna kontroller släpps vid paus, fokusförlust och avbrutna pekgester.
Kort- och managerspel använder riktiga fokusbara HTML-knappar för läsbarhet.

## Kvalitetsgenomgång av samtliga spel

Den andra genomgången omfattar alla 15 spel, deras faktiska interaktioner och
hur gränssnittet ryms på dator och telefon. De nya spelen har fått fler
miljödetaljer, tydligare kameror och återkoppling. De äldre spelens mer
detaljerade grafik har behållits och deras konkreta kontroll- och flödesproblem
har rättats.

- **Fantasy och Ambition:** bättre beslutsunderlag, uppdelad mobilmarknad,
  kommande matcher, taktiska AI-val, kortförhandsvisning med bekräftelse,
  synlig stickpott och uppföljning efter giv/omgång.
- **Gokart och triathlon:** rättvisare kollisioner och målgångsordning,
  omkörningar, varierande motorljud, disciplinspecifik rivalprogression,
  korrekt draghjälp och sammanhängande landskap utan hoppande kulisser.
- **Mångkamperna:** tydligare riktning och kastbanor, korrekt mätta hopp,
  bättre kameror, tydligare resultat och mer detaljerade gårdar, parker,
  banor, trävirke och vattenkanter. Bondespelen behåller sina fem bekräftade grenar.
- **Pingis, skytte och fäktning:** säkrare pekgester, återställda kontroller
  efter fokusförlust, visad skruv, tangentbordssikte, tydligare parader och
  korrigerad fintlogik.
- **Fiske och flipper:** gemensam aktiv klocka för gameplay och fördröjningar,
  frysta deadlines under paus, säkra avbrutna pekgester och oberoende hållna
  kontroller. Fiske räknar också närmissar, djupbonus och perfekta fångster rätt.
- **Måleri och lera:** riktig paus, frysta övergångar, tangentbordskontroller,
  säkrare modalhantering och tydligare verktyg. Måleriets pigment är också
  fokusbara knappar med droppantal; lera visar vägen till nästa stjärna.

`shared/game-clock.js` räknar endast aktiv speltid. Det gör att en fördröjd
serve, dom eller ny serie inte kan inträffa bakom en pausdialog. Globalt ligger
stängknappen ovanför spelens egna överlägg, och Escape ger dem möjlighet att
stänga hjälpen först. Den gemensamma arkadmotorn äger kontinuerliga ljudröster
och stänger av dem vid paus, tyst läge och avmontering.

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
Chromium. Den kontrollerar alla 15 spel på dator (1280×800), stående
telefon (390×844) och liggande telefon (844×390): start, synlig spelvärld,
paus med knapp och tangentbord, återupptagning, sidbredd och avmontering.
Skärmbilder sparas under ignorerade `scratchpad/arcade-checks/` för visuell granskning.
Profilen `small` lägger till 320×568. De äldre spelens Escape-hantering
kontrolleras så att hjälp/paus stängs utan att själva spelet försvinner.
Flipper och lera roteras även medan de är pausade: tid/fas jämförs och en
fryst scenbild sparas. Gokart, Bondespelen och triathlon har en geometrisk
kontroll som hindrar spelstatus från att överlappa rubriken i liggande format.

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
