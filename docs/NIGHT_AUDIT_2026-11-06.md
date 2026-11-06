# Nattgranskning av Pekkas Pokal, 6 november 2026

## Uppdrag och utgångsläge

Användaren har bett om självständig audit, iteration och förbättringar av
alla spel fram till 07:00 svensk tid, utan frågor, samt en sammanfattning
på morgonen. Tidsgräns: **2026-11-06 07:00 Europe/Stockholm (06:00 UTC)**.
Arbetet fortsätter på `feat/complete-historical-arcade`, i
[utkast till PR #99](https://github.com/olovmelander/pekkas-pokal/pull/99).

Basen för nattpasset är `49fa4c5943420a1d853bbf972c0fe16f8beb501c`.
Den innehåller alla 15 spel, det större grafiklyftet för 2011–2018 och
Varggropens avlästa 665-metersbana. Basens verifiering: 123 enhetstester,
24 nya browserkombinationer, bygg och delningssidor godkända; ESLint har
0 fel och befintliga stil-/komplexitetsvarningar. Dessa tidigare resultat
ska inte förväxlas med verifiering av nattens kommande ändringar.

## Arbetssätt

- Sök reproducerbara problem i faktiska spel, inte ändringar för sakens skull.
- Prioritera korrekt spelmekanik, känsla, återkoppling, läsbarhet och stabil
  mobil-/tangentbordsstyrning. Bevara bekräftade grenar och dokumenterade regler.
- Jämför grafik i ordinarie rendering; ange när testklockan accelereras.
- Högst två samtidiga GPU-browsers i denna miljö. Håll isär aktivt
  utvecklingsbygge och fryst produktionsbygge under verifiering.
- Lägg till meningsfulla regressioner och kör berörda kontroller efter fix.
- Checkpointa verifierade ändringar till samma branch/PR. Inga merge,
  publiceringar, större beroendeuppgraderingar eller destruktiva ingrepp.
- Bokför vad som faktiskt har gjorts och det som återstår. Ingen utfästelse
  om perfektion, oavbruten körning eller fysisk telefonprestanda utan evidens.

## Första passet — verifierat

Kodcheckpoint: `0724811bda9fb3cadf23e3eaa49b46fa3b9f2291`. Slutkontroll: 2026-11-06 00:21 UTC.

Start: 2026-11-05 23:38 UTC. Sex delgranskningar arbetade på åtskilda filer:

| Område | Ägare i första passet | Detaljerade arbetsanteckningar |
| --- | --- | --- |
| Gokart, triathlon | kart | `/workspace/pekkas-night/kart-triathlon.md` |
| Skytte, fäktning | triathlon | `/workspace/pekkas-night/shooting-fencing.md` |
| Bondespel, gårdskamp | farm_games | `/workspace/pekkas-night/farm-country.md` |
| Femkamp, parkmästare, pingis | field_games | `/workspace/pekkas-night/field-pingis.md` |
| Ambition, lera | ambition | `/workspace/pekkas-night/ambition-clay.md` |
| Fantasy, fiske, flipper | kart/tri_audit | `/workspace/pekkas-night/fantasy-fishing-pinball.md` |
| Gemensamt skal och Måleri | root | denna rapport |

Första passets regel-, input-, kamera- och livscykeländringar är verifierade
nedan. Den efterföljande bildgranskningen gav mindre nya fynd som tas vidare
i nästa pass; checkpointen är inte ett påstående om visuell perfektion.

## Verifierade förbättringar

Första passets ändringar har klarat både riktade regressioner och den
gemensamma kontrollen av ett fryst produktionsbygge.

| Spel/område | Förbättring och belägg |
| --- | --- |
| Gemensamt skal | Native Space/Enter stannar på fokuserad knapp; lokala dialoger äger Tab. Styrningen fungerar efter pekarklick på ljud/paus. Webbläsarens modifierade kortkommandon tas inte över. Paus vilar GPU:n, medan rotation ritar en ny fryst bild. Verifierat med verkliga tangent-/pekarklick och räknade renderanrop. |
| Fantasy 2011 | Transferprognosen inkluderar kaptenens dubbla/trippla poäng och visar återstående budget. Verifierad mot lagets nästa prognos och genom fem omgångar/omstart. |
| Gokart 2012 | Kameran följer Varggropens hårnålar utan att tappa föraren utanför smala skärmar. Motorljudet följer belastning och broms. Tidvisningen kan inte avrundas till 0:60.0. Ett komplett lopp på 2:15,7 och alla spårlägen på banan verifierade. Varggropens befintliga avlästa profil bevaras. |
| Femkamp 2013, Parkmästare 2014 | Krocket kräver plats för hela bollen genom bågen. Häcklopp bedömer hopphöjd vid själva passagen och ger samma beslut vid 20/60/120 Hz. Kast har separat ägare och avbryts säkert; pausad rotation uppdaterar kameran. |
| Bondespelen 2015 | Avbrutet stövelkast nollställer laddningen; tangent/finger kan inte släppa varandras hållning. Kameran följer höga vedstaplar. Fem spikar inom 12 sekunder ger nåbar fullpoäng, verifierat med 15 rena slag vid 20–120 Hz. Alla fem grenar, totalresultat och omspel provspelade. |
| Gårdskamp 2016 | Oberoende kontroller, tydligare motstyrningshjälp på stocken, omedelbart uppdaterad totalsumma och synlig återkoppling för sista grenen. Samtliga tre grenar genomspelade till 3 000/3 000 poäng. |
| Triathlon 2017 | Jämn rörelsefas vid tempobyte, korrekt sidoposition vid föremålspassage och målgång vid den faktiska passagetiden. Armar/cykel ryms i smal telefonbild. Komplett lopp på 1:18,8 med 8 ringar, 15 flaskor och inga hinderkollisioner. |
| Ambition 2018 | Regelboken håller tangentbordsfokus; kameran ramas om vid pausad rotation utan att giv/timer ändras. En hel giv med 13 uttryckligt bekräftade kort och mobilvy på 320 px verifierad. De forskade kortreglerna är oförändrade. |
| Pingis 2019 | Ut-bollar returneras inte felaktigt, serven byts varje boll från 6–6, långa segrar ger ingen minusbonus, enskild match nollställer poäng och finalen bevarar hela cupens längsta rally. Tangentbord kan nu placera slag även i sidled. Motorfixtures verifierar faktisk bollretur och skruv. Regeltexten har en egen scrollregion så att återgå-knappen inte täcker den i liggande telefon. |
| Måleri 2021 | Snabbt hopp över betyget stoppar gamla stjärnor/applåder/konfetti utan att förlora bonusen. Omstart rensar även pågående animationer. Sekundärmus och webbläsarkortkommandon målar inte. Resultatskärmens bakgrundsljud pausar vid fokusförlust. Tre verk, tidigt/sent överhopp, bibehållna poäng och omstart verifierade. |
| Skytte 2022 | Ljudavstängning omfattar vinden. Synlig duva, träffberäkning och krosseffekt använder samma ballistik/träffpunkt; tidigare krossfel var 0,687 m vid 20 Hz. Tangentalias hålls separat. Rotation avbryter aktivt siktdrag utan falsk sving eller skott. |
| Fäktning 2023 | Först inledd attack behåller sin rätt; en fras kan ge exakt en tusch. Gardindikatorn visar bara verklig försvarsförmåga. Tränartips och ljud respekterar paus/fokus. Fem separata tuscher till verkligt matchresultat verifierade. |
| Fiske 2024 | Hållna tangentalias och pekare släpper inte varandra. P-repeat växlar inte paus upprepade gånger. Mute påverkar hela ljudbussen även när pauspanel visas. Nio verkliga pekningar gav tre perfekta kast; resultat och omstart verifierade. |
| Flipper 2025 | Multiball räknar intjänade, väntande ersättningsbollar. Tre samtidiga dräneringar ger tre återkommande bollar, även efter räddningsfönstrets slut; tilt upphäver räddning. Paus håller kön. Separat spel med tre naturliga dräneringar gav 101 300 poäng och fungerande omstart. |
| Lerskulptur 2026 | Formning och glättning har separata fingerägare. Dolda fasknappar kan inte få Tab-fokus; snabbspola är en riktig knapp. Nästlad hjälp/paus återställer fokus. Utställningen ramas om vid pausad rotation. Sena stjärneffekter stannar på rätt alster. Fyra alster inklusive bonus, multitouch, resultat och omstart verifierade. |

### Slutlig verifiering av första passet

- `npm run build` och `npm run share-pages`: godkända. Delningssidor för
  15 år och 13 deltagare. Innehållet i `dist/src/games` jämfördes med
  källfilerna och var identiskt under hela browserkontrollen.
- **45/45 browserkombinationer godkända**: alla 15 spel på 1280×800,
  390×844 och 844×390, normal rendering/RAF mot fryst produktionsbygge.
  Kontrollerna avser laddning/start, rendering, paus/fortsättning, fokus,
  viewport och städning. Fulla spelflöden verifieras separat nedan.
- Samtliga 45 bilder öppnades och granskades. Vissa är tidiga
  introduktions-/kamerafaser; de kompletteras av normalrenderade
  spelsituationer i de riktade kontrollerna.
- ESLint: **0 fel, 1 310 varningar**; befintlig stil/komplexitet dominerar.
  `git diff --check`: ren.

### Verifieringsmetod för första passet

- **177 enhetstester i 28 filer passerar**, jämfört med 123 vid nattens
  start. Nya regressioner täcker verkliga regler, boll-/projektilförlopp,
  kamerautsnitt, ljud och gestägarskap.
- [Gemensamt skal](../scripts/check-arcade-shell.mjs) provkörs i normal
  rendering: fokus, native-knappar, styrning, vila under paus, rotation,
  lokal dialog och städning.
- [Måleriets övergångar](../scripts/check-painting-transitions.mjs) kör
  den verkliga spelmotorn med en styrd 20 Hz-klocka och undertryckt
  scenrendering. Den kontrollen säger inget om fysisk GPU-prestanda.
- Övriga riktade flöden använder riktiga handlers/knappar med kontrollerade
  spelsituationer och ibland accelererad klocka. Separata normalrenderade
  bilder och paus-/rotationspass granskas visuellt.
- Två touchtest behövde korrigeras: CDP:s `touchEnd` anger fingret som
  avslutas. Harnessarna avslutade först fel finger; detta bokfördes som
  testfel och föranledde ingen felaktig produktändring.
- Detaljloggar, skärmbilder och JSON-resultat ligger i första passets
  arbetskatalog `/workspace/pekkas-night/`. Tabellen ovan bevarar resultat
  även om en senare körning får en ny miljö.

## Fortsättning och begränsningar

### Fynd som förs till nästa pass

Den visuella kontrollen gav tre konkreta mindre brister: luftgevärstavlans
stödben har 0,54 m glapp till gruset, lillen i boule har låg kontrast i
liggande telefon, och Tobias/spelarens simmodeller överlappar vid starten.
Flipperinstruktionens pulserande text har också för låg kontrast.
Fäktningens tvåtummars-/click-fel har reproducerats i riktig Chromium;
field-riktningsknapparnas blandade hållkällor har reproducerats genom de
faktiska registrerade callbacks. En kort kvarhållning av DOM via
grafikfelnotisens timer är belagd; ingen permanent resursläcka är belagd.
Dessa är ännu **inte åtgärdade** i kodcheckpointen ovan.

### Kö för följande nattpass

Följande är kandidater att **reproducera**, inte redan bekräftade eller
åtgärdade fel. Välj nya substantiella kontroller; kör inte hela sviten
igen utan ny ändring eller konkret kvarstående osäkerhet.

1. Fäktningens självständiga handlingsknappar avvisar sekundärpekare.
   Prova två verkliga tummar på gard/stöt och hjälpmedelsaktivering via
   enbart `click`. Utvärdera separat från ägarskapet för ett siktdrag.
2. Prova blandade hållkällor och fokusbyte även på de äldre spelens
   riktningsknappar. Ny kontroll ska omfatta faktisk input, paus och
   återgång; anta inte att en ensam boolean automatiskt är en spelbugg.
3. Granska längre spelpass visuellt på 320 px och liggande telefon:
   instruktionernas läsbarhet, respons på träff/miss, kamera och effekter
   under verkliga spelsituationer. Jämför nya miljöer med de äldre spelen
   och bevara den genomarbetade ljus-/materialstilen.
4. Kontrollera resursstädning och återkommande byte mellan spel utan att
   blanda ihop SwiftShader-tider med prestanda på fysisk mobil.
5. Före morgonrapporten: kontrollera senaste verifierade commit, öppna
   fynd, faktiska automationskörningar och skillnaden mot nattens bas.
   Starta inga nya produktändringar efter 05:40 UTC; tidsgränsen är
   06:00 UTC och rapporten ska ange kvarstående begränsningar.

Fortsatta pass ska läsa aktuell version av denna rapport, Git-status och
PR-branchen innan de arbetar. Lokal samordning finns i
`/workspace/pekkas-night/state.json` och `active.lock/owner.json`.
En aktiv lease betyder att en annan passägare skriver: arbeta då enbart
med oberoende läsgranskning och lämna fynd för integration.

Nattpass är schemalagda timvis 01:00–06:00 Europe/Stockholm denna natt;
morgonrapporten är schemalagd 07:00. Schemaläggningen bekräftades 23:44 UTC.
Detta är körplanen, inte ett påstående att framtida pass redan har körts.
Om arbetsmiljön byts och den lokala leasen saknas medan denna rapport
säger att ett pass pågår utan verifierad checkpoint, gör enbart läsgranskning fram
till dess att en avslutad checkpoint finns. Ingen parallell skribent ska
gissa att en saknad lokal låsfil betyder att en pågående annan miljö är ledig.

Chromium och emulerade skärmstorlekar finns. Fysisk telefon, Safari/iOS och
verklig GPU-prestanda är ännu inte verifierade. Morgonrapporten ska skilja
slutförda ändringar från fynd, framtida förslag och ej utförda tester.
