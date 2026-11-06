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

## Andra passet — verifierat

Kodcheckpoint: `95e8a186cb39f93e923fa058fcbfebea50772b36`. Slutkontroll: 2026-11-06 00:45 UTC.

Detta pass följer upp konkreta fynd från första checkpointens bild- och
inputgranskning. Ändringarna nedan är nya efter `aece1ca`; första passets
och nattbasens förbättringar räknas inte igen.

| Spel/område | Ny förbättring och riktad verifiering |
| --- | --- |
| Fäktning 2023 | Båda tummarna kan välja gard/stöt oberoende. Hjälpmedelsaktivering via enbart klick fungerar. Pekarsläpp och upprepade Enter/Space skapar inga extra handlingar. Fem verkliga browserfel före rättning, 18/18 fall efter; fyra nya enhetstester. |
| Femkamp 2013, Parkmästare 2014 | Riktningsknappar behåller varje finger och fysisk tangent separat. Orelaterat släpp avbryter inte styrningen; Tab/fokusbyte lämnar ingen fastlåst tangent. Knappens nedtryckta utseende följer det samlade tillståndet. Åtta nya regressioner, 20 riktade browserkontroller och 11 återkontroller av input/knappåterkoppling. |
| Parkmästare 2014 | En stilla mörk/ljus markring gör lillen synlig mot gruset, även på 320 px och i liggande telefon. Markeringen följer alla tre målplaceringar; bollstorlek, poäng och kastfysik är oförändrade. Tre riktiga kast och målkoordinater verifierade. |
| Bondespel 2015 | Luftgevärstavlans stöd når nu marken. Verklig world-geometri mätt före/efter: nederkant 0,55 → −0,05 m, överkant kvar 5,95 m. Sex bilder från samma kameror jämförda i tre format. Markkontakten syns direkt på dator/telefon; i liggande vy ligger nederdelen bakom kontrollpanelen och styrks av geometrimätningen. |
| Triathlon 2017 | Fyra simmare startar åtskilda och ryms i telefonbilden. En första bredare placering klippte en arm på mobil och ersattes före checkpoint med smalare fasta simspår. Verkliga animerade kroppsmått och projektion testas även vid 320 px. Minsta marginal cirka 0,206 m vid start och 0,191 m med maximal passiv ström. Normalrendering i tre format, omstart och stängning godkända. Löp-/cykelspår, drafting, fart och måltider bevarade. |
| Pingis 2019 | Motståndar-/rallybanner och coachtext visas efter varandra i låg liggande vy. Båda läsbara faserna bildgranskade; coachen återkommer när den befintliga toasten upphör. Inga nya timers. |
| Flipper 2025 | Avfyrningsinstruktionen har stabil ljus text och mörk bakgrund i stället för en kontrastsvag opacity-puls. Text/mätare ryms i 320×568, 390×844, 844×390 och 1280×800. Turkos timingåterkoppling och riktig touch-/Space-avfyrning verifierade. |
| Gemensam grafik | En väntande grafikfelnotis-timer avbryts vid destroy. CPU-repro visade tidigare en borttagen DOM-notis kvarhållen upp till 12 sekunder; efter rättning återstår varken timer eller context-listener. Upprepad dispose och frånvarande host testade. Ingen permanent GPU-läcka påstås. |

### Andra passets verifieringsmetod

- **192 enhetstester i 31 filer** passerade. Efter simspårens sista
  begränsning kördes de 23 berörda triathlontesterna igen: alla godkända.
- ESLint: **0 fel, 1 309 varningar**. Ny input-/rivalhjälpkod har inga
  lintfel; `git diff --check` är ren.
- Produktionsbygge och delningssidor godkända. `dist/src/games` jämfördes
  med källfilerna före och efter browserkontrollen och var identiskt.
- **21/21 nya produktionsfall godkända**, ordinarie RAF mot fryst bygge:
  2013, 2014, 2015, 2017, 2019, 2023 och 2025 × 1280×800, 390×844,
  844×390. Start/rendering, paus/återgång, tangentbordsfokus, viewport
  och stängning verifierade; båda harnessarna avslutade med exit 0.
  Alla 21 bilder granskade. Några äldre spels bilder visar tidig
  introduktion/kameraövergång, vilket inte är bevis för senare matchläge.
- De riktade fäktnings-, field- och flipperkontrollerna använder riktiga
  DOM-/CDP-händelser men styrd klocka och undertryckt RAF. Stillbilderna
  använder ordinarie grafikpipeline. De är inte normal-RAF-spelpass eller
  mätningar av fysisk telefonprestanda.
- Farmens A/B-bilder och triathlonets slutliga startbilder använder
  ordinarie RAF/rendering. Farmens jämförelse sätter samma kamera i båda
  fallen; gamla stöd återskapas enbart genom testets nätverksinterception.
- Testharnessar korrigerades för för snäv kameratolerans, modulcache vid
  samma hash och en tvetydig knappselektor. Ett devserveravbrott krävde
  omkörning av två farmbilder. Dessa var test-/miljöfel, inte produktfel.
- Detaljbevis: `shooting-fencing-pass2.md`, `field-pingis.md`,
  `farm-country-pass2.md`, `pass2-triathlon-start.md`,
  `fantasy-fishing-pinball-pass2.md` och `gfx-cleanup.log` under
  `/workspace/pekkas-night/`.

### Kompletterande Varggropen-research

[Klubbens bansida](https://vkrc.se/klubben/banan/) bekräftar 665 m,
tekniska kurvor, kuperad terräng och 40–50 sekunders hyrkartsvarv. Första
nattpassets 43,4 s är förenligt med beskrivningen. En
[samtida deltagarblogg från juni 2012](https://ragokartracing.blogspot.com/2012/06/)
gav ingen inmätt höjdprofil eller entydig startlinje/körriktning för
Pekkas tävling. Ett sökresultat med namnet banprofil gällde ett skidspår,
inte gokartbanan. Ingen ny tillförlitlig höjdprofil hittades i denna
begränsade komplettering. Den tidigare avlästa planen och dess uttryckliga
osäkerhetsmarkeringar bevaras; ingen banändring räknas som nytt nattarbete.

## Tredje passet — verifierat

Kodcheckpoint: `a6eaf3a12ff17294dd4c2216fcf05bdf601d7ff6`.

Fortsättningen utgår från de reproducerade inputluckorna efter andra
checkpointen. Målningens befintliga modifieringsskydd var korrekt; de
övriga spelens lokala lyssnare behövde samma policy som skalet.

- Ctrl/Meta/Alt-kombinationer startar inte längre spelhandlingar i
  berörda lokala handlers: exempelvis kaptensbyte vid kopiering i Fantasy,
  paus vid utskrift i pingis, glättning/slutförande i lera, skott, kast,
  styrning, acceleration, fiske och flipper. Ambitions kortnavigering
  och regelboksfokus lämnar modifierade kommandon ifred.
- Farm/country/kart/triathlon ignorerar höger- och mellanmusknapp på
  hållkontrollerna. En ickeprimär andra touchkontakt är fortsatt giltig.
- Fysisk keyup rensar sin ägare även om Ctrl/Meta/Alt tryckts efter
  nedtryckningen. Shift, vanlig Space och skalets redan förhindrade
  Space-händelse fungerar fortsatt. Inga guards lades på release/cancel.
- Fäktning avvisar modifierad hjälpmedelsklickning. Ett verkligt native-fynd
  krävde också att modifierad Enter/Space på just handlingsknapparna
  avbryter nativeaktiveringen: Ctrl ned → Space ned → Ctrl upp → Space
  upp skapade annars en omodifierad klickhändelse och en oavsiktlig stöt.
  Vanlig Enter, Shift+Space/F och hjälpmedelsklick bevaras.
- Sidans yttre Escape-handler ignorerar också Ctrl/Meta/Alt. Den stänger
  därför inte hela spelet när den lokala spelhandlern korrekt avstår.
  Faktisk callbackrepro före/efter: tre modifierade stängningar → noll;
  vanlig Escape behåller sin stängning och lokal dialogprioritet.

### Tredje passets riktade belägg

- **213 enhetstester i 31 filer** passerar. Nya EventTarget-regressioner
  täcker sekundärmus, modifierad aktivering, fortsatt Shift-styrning,
  modifierare tillagda före fysisk release, andra tummen och AT-click.
- ESLint: **0 fel, 1 310 varningar**. `git diff --check` är ren.
- Nya spelens riktade normalrenderade browserpass: **38 godkända
  kontrollgrupper**, sex desktopspel och två telefonfall. Inkluderar
  156 levererade modifierkombinationer, 24 riktiga höger-/mellanmussekvenser,
  riktig tvåtummarsstyrning och korrekt stängning utan canvas/sidfel.
- Äldre spel plus Fantasy/Ambition: ett pass över åtta spel gav 109/110
  godkända kontroller och fann native-Space-kedjan ovan. Efter rättning
  passerade samtliga **25 riktade fäktningskontroller**, inklusive felet
  och positiva grundhandlingar. Inga sidfel. Denna kontroll undertrycker
  rendering/RAF och sätter explicita aktiva spelfaser, men dispatchar till
  riktiga DOM-handlers och verifierar verkliga handlingar, t.ex. förbrukad
  patron, pingisserve, kaptensbyte och plungerladdning. Det är inget
  grafik- eller prestandabevis.
- Reserverade system-/browserkombinationer provas som levererade
  DOM-events. Rapporten påstår inte att varje operativsystem skickar
  varje sådant kortkommando till sidan. Native Ctrl/Space/Enter i
  fäktningen samt normala mus-/touchhändelser kördes via Chromium-input.
- Sex initiala 5-sekunders cleanup-timeouts i den nya inputharnessen
  korrigerades till normal 30-sekunders väntan; alla sex omprov passerade.
  Classic-harnessen fick färska dokument vid spelbyte för att undvika
  gamla testhooks från hash-navigation. Båda var testfixturproblem.
- Detaljer: `pass3-input.md`, `pass3-classic-modifiers.md`,
  `overlay-modifiers-before.json` och `overlay-modifiers-after.json`
  under `/workspace/pekkas-night/`. Permanent inputharness ligger i
  `scripts/check-input-guards.mjs` och `scripts/check-classic-input-guards.mjs`.

### Tredje passets slutliga produktionskontroll

- Bygge och delningssidor passerade. `dist/src/games` var identiskt med
  källfilerna före och efter testerna; inget ombygge under browserkörning.
- **38/38 kontrollgrupper** i den normala inputharnessen mot produktion:
  sex desktopspel och två telefonfall. Dessutom **4/4 grupper** för
  samma riktiga tvåtummarssekvenser och stängning i liggande telefon.
  Detta är 42 kontrollgrupper, inte 42 separata spel/viewportkombinationer.
- Den portabla classic-harnessen passerade **119/119 kontroller** mot
  produktion, inklusive native-fäktningskedjan och sidans modifierade
  Escape. Riktiga handlers och spelhandlingar, undertryckt rendering/RAF
  enligt metoden ovan. Inga sidfel eller instrumenteringsfel.
- Samtliga tre produktionsprocesser avslutade med exit 0 och stängda
  browsers. Detaljer sparade i `pass3-production-input/`,
  `pass3-production-landscape/` och `pass3-production-classic.json`
  under `/workspace/pekkas-night/`.

## Fjärde passet — verifierat

Kodcheckpoint: `f30b7a28c23e33971d0cfacdae70241456c84f92`.
Slutkontroll: 2026-11-06 01:39 UTC.

Pingis, skytte, fäktning och fiske vilar nu under paus, men ritar en ny
fryst bild vid rotation, återkomst eller återställd WebGL-kontext. Fiskets
fångstdagbok omfattas också. Spelklockor, bollar/duvor, figurer och beslut
står stilla. Kontextlyssnare tas bort när spelet stängs. Skyttets asynkrona
grafikfallback begär en ny bild först efter sin väntan och endast om
spelet fortfarande lever.

Före rättning gav åtta pausade RAF **968/648/680/304 ritanrop** i
2019/2022/2023/2024; efter rotation **1200/680/928/312**. Efter rättning
är motsvarande lugna åttarutorsintervall **noll** i alla fyra. Detta är
räknat GPU-arbete, inte ett påstående om batteritid eller fysisk mobil-FPS.

Fäktning räknar inte längre paustid som långsam gameplay och sänker därför
inte grafiknivån medan spelaren läser reglerna. Verkliga callbacks med
styrda 20 Hz-tidsstämplar bevarade bloom, DPR 2, skuggkarta 2048 och hela
duelltillståndet under 330 pausade rutor (16,5 s). Vid 500 aktiva rutor
fungerade den befintliga nedtrappningen fortfarande: nivå 3, bloom av,
DPR 1,5, skuggkarta 1024. Kontroll med undertryckt ritbudget, inte en
prestandamätning. Stängning tog bort både väntande RAF och spel-API.

### Bildgranskningen fångade ett ytterligare återställningsfel

Första omritningsprovet passerade sina 29 struktur-/tillståndskontroller,
men bilderna visade att GPU-bakade miljöreflektioner blev tomma efter
verklig kontextförlust: fiskarna och geväret mörknade, liksom parkett,
pist och bordslack. Det var inte tillräckligt att scenen åter ritades.
Det första resultatet räknas därför inte som godkänd visuell återställning.

De fyra spelen återskapar nu sina egna ljusmiljöer före första tillåtna
synliga bild. Händelsen sätter bara en väntande flagga; en dold flik bakar
inte om miljön. Gamla targets frigörs och destroy äger den senaste.
Avsiktligt bortvalda reflektioner och främmande kartor bevaras. Pingis
återger sin ursprungliga hallcapture utan spelare, priser, spegel eller
ändrad matchbelysning/resultattavla; aktuellt scen-/materialtillstånd
återställs efter bakningen. Hjälparna för skytte/fiske återställer temporärt
ändrad scen och frigör bakningsresurser även vid fel.

### Fjärde passets verifiering

- **213/213 enhetstester i 31 filer**, ESLint **0 fel/1 310 varningar**,
  syntaxkontroller och `git diff --check` godkända efter sista produktändring.
- Bygge och delningssidor godkända. Källor och `dist/src/games` identiska
  före och efter normaltestet. Inget ombygge medan browsers använde dist.
- [Ny normalharness](../scripts/check-paused-rendering.mjs): **41/41
  kontrollgrupper** mot fryst produktion. Fyra spel, telefon 390×844 som
  roteras till 844×390 och vidgas till 1280×800. Vanlig RAF/rendering,
  faktiska knappar och befintliga spel-API för start av rally/duva/duell.
  Det är inte tre separata enhetsprofiler eller fulla matcher.
- Varje spel genomgick **två riktiga WebGL loss/restore**, synlig respektive
  dold→synlig. Headless Chromium behöll flikar synliga; därför emulerades
  endast document-visibility och riktiga visibility-handlers anropades.
  Ingen verklig bakgrundsflik eller fysisk telefon påstås testad.
- Efter återställning: rätt fryst tillstånd, omritning följd av noll
  ritanrop, fungerande fortsättning, inga canvas/ritanrop efter stängning
  och inga sidfel. Fångstdagbokens egen paus verifierad.
- **Alla 20 slutbilder öppnade och granskade**: telefon, liggande, vidgad
  vy, synlig restore samt dold restore för varje spel. Ljus/reflektioner
  är bevarade, inga nya konkreta bildregressioner hittades.
- Regressionen jämför 24×24-pixelrutor i samma frysta scen. Före fix var
  största RGB-medelabsolutförändringen cirka **12,14/23,11/45,80/48,17**
  för 2019/2022/2023/2024. Efter fix är den **0,02662/0,00231/0/0**,
  samma utfall vid båda återställningarna; toleransen är 4 RGB-nivåer.
  Måttet kompletterar bildgranskningen och säger inget om andra grafikkretsar.
- [Beständig kvalitetsregression](../scripts/check-fencing-paused-perf.mjs)
  passerade mot dev och produktion med styrd tid enligt metoden ovan.
  CPU-kontroller av verkliga callbacks/helpers täckte även upprepad
  restore, null-fallback, exakt target-ägarskap och städning vid throw.

Underlag: `pass4-final-pingis-fencing/`, `pass4-final-shooting-fishing/`,
`pass4-production-perf.json`, respektive spelpars `.md`-anteckning samt
`pass4-final-{unit-tests,lint,build}.log` under `/workspace/pekkas-night/`.
De första mörka återställningsbilderna är bevarade i katalogerna med
suffix `before-environment` och räknas inte som slutbilder.

## Dagpasset 6 november — verifierat

Utgångsläge: `8162b12`, fjärde nattpassets checkpoint. Inga senare nattpass hade
körts när dagpasset tog över 06:20 UTC; ingen annan skribent var aktiv.

| Spel/område | Förbättring och belägg |
| --- | --- |
| Gemensam arkadmotor (2011–2018) | Den förfiltrerade miljön bakas om efter verklig WebGL-återställning, före första synliga bild och aldrig i en dold flik. Det döda målet släpps i stället för att raderas igen, vilket annars ger WebGL-varningar. Pixeltest med riktig `WEBGL_lose_context` på en pausad bild (medel / sämsta 24 px-ruta): Ambition 13,9 / 51 → 0 / 0, triathlon 1,9 / 24 → 0 / 0. |
| Måleri 2021, Flipper 2025, Lerskulptur 2026 | Samma ombakning, bara där miljön fortfarande används (säkert läge, saknade flyttalsmål och Måleriets vaktsteg bevaras). Flipper bakar även kulans egen miljö. En återställning under paus ritar om den frysta scenen i stället för att lämna den svart. Måleri 16,3 / 51,7 → 0 / 0, Flipper 6,2 / 60,2 → 0 / 0, Lera 16,1 / 26,5 → 0 / 0. Inga varningar under återställningen. |
| Grafikskyddet (alla spel) | Notisen om tappad grafik säger att den kommer tillbaka och ersätts av "Grafiken är tillbaka." när webbläsaren lämnar tillbaka kontexten, i stället för att be spelaren stänga ett spel som redan fungerar. |
| Skuggor (2011–2018) | `PCFShadowMap` i stället för borttagna `PCFSoftShadowMap`; r187-varningen i varje nytt spel är borta. |
| Dialoger (2011–2018) | Start-, instruktions- och resultatdialoger tonar ut spelets egen HUD, instrumentpaneler och kontroller. Tidigare syntes t.ex. gokartens rubrik och triathlonets tidtagning bredvid dialogen. Resultatdialogerna innehåller hela resultatet själva. |
| Bondespelen 2015 | Kontrollerna dockas till höger i liggande telefon, som i Gårdskampen; tavla, vedstapel och kast syns fritt. Bildkontrollerat i 844×390. |
| Fäktning 2023 | Coachrutan ligger uppe till vänster under poängen i kort landskap. Uppmätt överlapp med fäktarnas armar/klinga vid första anfallsvarningen: 12 000 px² → 0 i både 844×390 och 667×375. Stående och dator oförändrade. |
| Triathlon 2017 | Spelaren kan inte längre simma, springa eller cykla genom Per, Mikael och Tobias. Kropparna hålls isär efter verklig storlek per gren (simmare 0,77 × 2,22 m, löpare 0,49 × 1,19 m, cyklist 0,59 × 2,36 m) plus en liten marginal. Spelaren glider mjukt förbi på den sida hen redan ligger, eller hålls strax bakom när en sidoförflyttning skulle lämna banan, krocka med en annan rival eller ändra en ring, flaska eller bom; styr man ut släpper det direkt. Ingen fart- eller energiförlust, och läet fungerar som förut. 600 slumpade lopp i 30/60/144 Hz: synligt överlapp 154 bildrutor per lopp → 0, medeltid 96,63 → 96,69 s, inga sidoryck över 4,5 m/s. Två hela lopp i webbläsaren (1280×800, 390×844) till resultat. |

### Dagpassets verifiering

- **225 enhetstester i 32 filer** passerar (12 nya för triathlonets avstånd:
  kroppsmått mot verkliga modeller, passage i varje gren, hållning vid ring,
  oförändrat lä, 4 000 slumpfall utan NaN och ett helt skriptat lopp).
- ESLint **0 fel** (1 315 varningar, stil/komplexitet som tidigare).
  `npm run build` och delningssidor godkända; `git diff --check` ren.
- **Spelbyte:** tio spel öppnade och stängda i följd i samma sida (2011–2018,
  2019, 2025): tio WebGL-kontexter skapade och tio släppta, inga
  kvarlämnade canvas-element, inga varningar om för många kontexter, inga sidfel.
- **Bilder:** alla åtta nya spel i 1280×800, 390×844 och 844×390 (titel,
  instruktion och spelläge), samt 2011, 2012, 2015 och 2018 i 320×568, öppnade
  och granskade. En uppmätt kontroll visade att gokartens HUD och minikarta
  inte överlappar på 320 px.
- **Testmiljö:** webbläsarkontrollerna använder Chromium med SwiftShader via
  ett testverktyg som serverar källträdet och lokala kopior av Three.js. I
  denna sandlåda når Chromium inte CDN:et genom proxyn, så `npm run test:games`
  mot produktionsbygget laddar inga spel här; det är en miljöbegränsning.

### Status för nattens kö

1. Fäktningens coachruta i kort landskap: **åtgärdad**. Engångsbakade miljöer
   i de åtta nya spelen samt Måleri, Flipper och Lera: **åtgärdade och
   bildverifierade** med verklig förlust och återställning.
2. Fri passage genom triathlonrivaler: **åtgärdad** utan fartstraff och med
   oförändrat lä.
3. Granskning på 320 px och liggande telefon: **utförd**, en åtgärd (Bondespelens
   kontroller).
4. Resursstädning vid byte mellan spel: **kontrollerad**, ingen läcka.

**Kvarstående, kända och ofarliga:** att stänga ett spel *efter* en förlorad
kontext ger upp till cirka 250 konsolvarningar ("object does not belong to this
context") från three.js-objekt skapade före förlusten. Det gällde redan före
dagpasset, påverkar inte spelet och försvinner när kontexten släpps. I triathlon
kan en rival som når en växlingslinje ovanpå spelaren vara dold upp till cirka
0,2 s medan spelaren glider undan, och den som styr rakt in i en rivals spår
bakifrån hålls bakom tills hen styr ut.

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
Dessa fynd är åtgärdade i andra passet ovan; de ingick inte i första
kodcheckpointen.

### Kö för följande nattpass

Nedan skiljs bekräftade, ännu öppna fynd från bredare granskningskandidater.
Välj nya substantiella kontroller; kör inte hela sviten igen utan ny
ändring eller konkret kvarstående osäkerhet.

1. Pausritningen, fäktningens pausorsakade kvalitetsfall och de fyra
   spelens förlorade miljöreflektioner är åtgärdade i fjärde passet.
   **Nytt bildbelagt fynd:** fäktningens coachruta täcker armar och
   vapenlinje i 844×390 under aktiv handledning, även under den första
   anfallsvarningen. En riktad placering i kort landskap återstår.
   Källgranskning visar dessutom samma engångsbakade miljömönster i
   de åtta nya spelen samt Måleri, Flipper och Lera. Verklig WebGL-
   återställning/bildbevis för dessa elva är ännu inte utförda i detta
   checkpoint; eventuell åtgärd kräver sådant belägg.
2. Triathlon har fortsatt fri passage genom rivaler senare i loppet.
   Startöverlappet är rättat, men personkollisioner eller automatiskt
   undanvikande skulle ändra spelmekanik/drafting och kräver en separat
   motivering och verifiering. Det är ingen utfäst åtgärd.
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
