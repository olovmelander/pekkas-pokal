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
  för den som inte deltog. Saknas placeringar för några som var med (som 2014
  och 2015, där bara pallen är känd), lämna deras rutor tomma: en resultatlista
  med luckor gör att utmärkelserna räknar de tomma rutorna som okända i stället
  för som frånvaro.
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

Bilden dyker upp automatiskt högst upp på det årets kort i Historik och på
årets egen sida (`#/ar/<år>`). Saknas en bild händer ingenting — inget att konfigurera.
Liggande format och ca 1200 px bredd fungerar bäst.

### 4. Sångboken

Fliken **Sånger** visar föreningens snapsvisor, ramsor och officiella låtar.
Texterna bor i [`src/data/songs.js`](src/data/songs.js) — lägg till ett nytt
objekt i listan (id, år, titel, melodi och textrader) så dyker sången upp i
väljaren automatiskt. En rad kan också vara `{ o: 'originalrad', t:
'översättning' }` om en sång sjungs på ett annat språk och behöver
radvis översättning.

### 5. Spel

Fliken **Spel** innehåller ett spel per år. 2025 är *Pekkas Pokal Flipper* — ett
flipperspel i Three.js som byggs helt i webbläsaren (ingen bild- eller
ljudfil laddas ner, bara Three.js självt, och först när man öppnar spelet).
2024 är *Pekkas Fiske* — ett fiskespel med samma teknik, inspirerat av
Ridiculous Fishings prisbelönta spelloop. 2026 är *Pekkas Lerskulptur* —
drejning i en Barcelona-ateljé, inspirerat av Let's Create! Pottery.
2023 är *Pekkas Fäktning* — dueller på pisten i Stockholm, inspirerat av
Nidhogg och riktiga fäktningens parad–ripost.
2022 är *Pekkas Lerduvor* — lerduveskytte över Arnäsvalls fält, med
olympiska skeetets pull-ritual och Duck Hunt-arvets sikta-och-skjut.
2019 är *Pekkas Pingis* — bordtennis i Bredbyns bygdegård, inspirerat av
Table Tennis Touch och Rockstars Table Tennis.
2021 är *Pekkas Måleri* — måleritävlingen i trädgården på Terrassvägen,
där färgen blandas subtraktivt på en riktig palett.

Alla spel kör på Three.js r187 och har egna adresser — `#/spel/2024` öppnar
fisket direkt, och bakåtknappen stänger spelet.

Att lägga till ett nytt års spel:

1. Skapa modulen under `src/games/<spel>/index.js` och exportera
   `default async function createX(container, opts)` som returnerar
   `{ destroy() }`. `destroy` ska städa allt — spelet öppnas och stängs om
   och om igen.
2. Exportera `layout = 'full'` om spelet fyller hela scenen på liggande
   skärmar. Utan den visas spelet i en centrerad porträttram på datorn.
3. Spelets egna stilar läggs i `src/games/<spel>/style.css` — filen laddas
   automatiskt när spelet öppnas, efter de delade HUD-stilarna i
   [`src/styles/game-hud.css`](src/styles/game-hud.css).
4. Lägg till en rad i `GAMES` i [`src/scripts/app.js`](src/scripts/app.js) med
   `year`, `title`, `tagline`, `icon`, `colors` (affischens två toner),
   `cover` (en stillbild i `public/games/`) och sökvägen i `module`.

Alla genomförda tävlingsår 2011–2026 har nu spel; 2020 var inställt. De åtta nya
årsspelen är Fantasy, Gokart, Femkamp, Parkmästare, Bondespel, Gårdskamp,
Triathlon och Ambition. [Spelöversikt, research och testinstruktioner](docs/arcade.md)
beskriver gameplay, källor och vilka regler som är arkadtolkningar. Nya år utan
spel visas automatiskt under "Kommande".

**Pekkas Gokart (2012)**

Tre varv på Varggropens 665 meter långa bana i kvällssol, mot Jonas, Erik,
Viktor, Per och Rickard. Karten har riktig gir och sladd: bromsa in i kurvan så
svänger den, släpp gasen mitt i kurvan så glider baken ut och fånga den med
motstyrning. Kantstenar skakar, gräset är långsamt och däckvallen studsar.
Starten sker med fem röda ljus, och den som gasar för tidigt får hjulspinn.
Välj **Lopp** eller **Tidskörning** mot ett spöke av ditt bästa varv, och
**Lätt**, **Normal** eller **Svår**.

| | Mobil | Dator |
| --- | --- | --- |
| Styr | ← →-knapparna eller dra med tummen på vänstra halvan | ←/→ eller A/D |
| Gas / broms | GAS och BROMS, eller AUTOGAS | ↑/W och ↓/S/mellanslag |
| Backa | Håll BROMS när karten står still | Håll ↓/S/mellanslag när karten står still |
| Kameravy | Knappen BAKOM/NÄRA | C |

Kameran sitter lågt bakom karten och vidgas med farten, däcken ryker i
sladdarna och motorljudet är en encylindrig hyrkartmotor med
centrifugalkoppling. [Research och gestaltning](src/games/kart/research.md)
beskriver vad som är belagt och vad som är tolkat.

**Pekkas Fiske (2024)**

Tre kast per fiskeafton på en 60 meter djup sjö i midnattssol. Varje kast har
tre faser, och det som gör loopen bra är att varje fas vänder på förra:

1. **Nedåt — väj.** Styr draget (dra med fingret eller ←/→) och slipp *förbi*
   fisken. Varje fisk du väjer för höjer multiplikatorn, och eftersom de fina
   arterna bara simmar djupt är belöningen för att väja bra att få väja mer.
   Nuddar du en fisk krokas den direkt. Nuddar du **skräp** — en gammal
   stövel, en rostig burk, ett cykeldäck — är kastet bränt och multiplikatorn
   nollad.
2. **Uppåt — träffa.** Nu gäller tvärtom: veven går och allt du nuddar åker
   med. Multiplikatorn du samlade på vägen ner spenderas här.
3. **I luften — tryck.** Fångsten slungas upp över båten. Tryck på fiskarna
   innan de plumsar i igen så åker de i tunnan. Träffar på rad kedjar ihop
   sig, och tar du alla blir det **perfekt kast**.

Mellan kasten lyfter kameran upp till båten, ett rundkort summerar fångsten
(antal fiskar, kastets poäng, totalen) och fiskaren vevar tillbaka spöet och
kastar ut draget i en båge över vattnet — nästa nedstig börjar alltså med ett
kast man sett, inte med en klippning. Den fisk som krokas hänger på själva
kroken: den placeras efter *munnen*, inte efter mitten, så nosen sitter kvar
på hullingen hur mycket den än sprattlar. Resten av fångsten hänger på
löpknuten under, med avstånd efter artens längd.

Går du hela vägen till botten utan att nudda något får du **bottenkänning**:
stor bonus och full multiplikator.

| Djupzon | Från | Vad som simmar där |
| --- | --- | --- |
| Ytvattnet | 0 m | Mört (100), abborre (250) |
| Sikdjupet | 12 m | Sik (400) |
| Gäddgraven | 24 m | Gädda (800) |
| Laxdjupet | 38 m | Lax (1 500) |
| Pekkadjupet | 50 m | **PEKKAGÄDDAN** (5 000) — guldfärgad, krönt, inte alltid hemma |

**Teknik.** Allt är procedurellt: inte en enda bild- eller ljudfil laddas ner,
bara Three.js självt. Varje fiskart byggs från en ryggradsprofil plus
fenblad och slås ihop till tre meshar per art, så hela stimmet ryms på ett
femtiotal draw calls. Mönstren — motskuggningen, abborrens ränder, gäddans
ljusa bönfläckar, laxens prickar — målas in i vertexfärgerna medan kroppen
genereras. Vattenytan förskjuts på GPU:n och skuggas olika ovanifrån och
underifrån: nerifrån får man Snells fönster (ljust rakt upp, spegel i sneda
vinklar) med kaustik som kryper över taket, ovanifrån en solglitterstig.
Kaustiktexturen är genererad ur vågintereferens så att den kaklar sömlöst.
Ljusstrålarna följer med ner i djupet i stället för att slockna vid 20 m,
så det aldrig blir ett tomrum under en, och stranden har tre granridåer
där varje bortre är blekare än den framför. Djupet styr färg, dimma, ljus — och ett lågpassfilter på hela ljudbussen, så
världen blir bokstavligen dovare ju längre ner man kommer. Ingen
efterbehandling: ACES-tonemappning gör jobbet i stället, så telefonen
behåller sin bildfrekvens.

**Uppgraderingen.** Fisket fyller nu hela skärmen även på datorn: kameran
ramar in nedstigningen olika för stående telefon och bred skärm, och
sjöbäckenets klippväggar, tångruskor och fjärran stim syns vid sidorna.
Fiskarna simmar med en riktig vågrörelse genom kroppen — hela sjön ritas med
en instansierad mesh per art — med sprintar och glid, och mörten går i stim
som vänder tillsammans. Under ytan bygger solstrålar från den brutna
midnattssolen, plankton och bubblor från draget upp djupet, och dimman tar
exakt vattnets färg så att allt långt bort smälter in; ovanför speglar sjön
samma himmel, trädraden och den röda stugan med bryggan. Varje kast har ett
uppdrag — lätt, mellan, svårt — som ger bonus och en stjärna, en utropare
ropar dubbelnapp och trippel, och den sista fisken i luften faller i slow
motion. Fångstdagboken minns varje art du fått upp, den största av varje och
dina rekord, och den som når botten hittar något gyllene bredvid den sjunkna
ekan. Fortfarande ingen efterbehandling: allt som glöder är sprites och ACES
gör graderingen.

**Andra uppgraderingen.** I ekan sitter nu Erik Vallgren – segraren i 2024
års Fisketävling i Själevad – i röd keps, fiskejacka och gummistövlar, samma
Erik som i de andra spelen. Han styrs av spöet: vevning, krokryck, när fångsten
slängs upp, bakåtsvingen och kastet är mål för spöet som armarna löses fram
till med IK, spöet böjer sig under lasten och linan lämnar den riktiga toppen.
Mellan kasten vevar han in och kastar ut draget i en båge över fören, och i
menyn guppar ett flöte på vågorna. Ekan är byggd från en linjeritning –
klinkbyggd med spant, durkar, toftar, åror och termos – och rider på sjöns egna
vågor, medan en osynlig torrmask håller sjöytan utanför relingen. För riktiga
grafikkort kompileras shaderna asynkront bakom laddkortet, spelklockan börjar
om varje timme så att våg- och simshadrarna aldrig tappar precision, och en
vakt förenklar vattnet om bilden skulle bli svart (`?gfx=safe` börjar där).


**Nattens uppgradering.** Pekkas Fiske fick en ny strand: fjäll, skogsklädda
åsar och granskog i flera led som bleknar i midnattsdiset, en holme och en udde
med röd stuga, brygga, flaggstång och luftiga björkar. Sjön speglar stranden på
riktigt, ett glitterstråk leder från solen fram till ekan, och ljuset kommer nu
från den låga solen bakom udden, med ett mjukt motljus i Eriks båt. Fiskarna är
omgjorda: mjuka kroppar, tunna genomskinliga fenor med strålar och varje arts
egna kännetecken, som abborrens taggiga ryggfena med svart fläck, gäddans långa
nos och laxens fettfena. Pekkagäddan bär nu en liten guldkrona på huvudet. Erik
håller spöet med ett riktigt grepp, högerhanden runt rullfästet och
vänsterhanden på veven, och båten gungar till när fisken hugger och när
fångsten landar i tunnan. Tre nya uppdrag och en kort paus i tiden vid snäva
passeringar gör nedfärden roligare.

**Pekkas Lerskulptur (2026)**

Kvällen i keramikateljén, som i Barcelona: keramikern visar en form, du
drejar den — och keramikern dömer, precis som i verkligheten.

1. **Forma.** Drejskivan snurrar. Dra mot leran för att trycka in, dra utåt
   för att dra ut — vid precis den höjd du rör. Målets silhuett hänger som
   ett spöke över skivan, och likhetsmätaren svarar på den enda fråga som
   räknas: börjar det likna?
2. **Glätta.** Håll GLÄTTA-knappen så jämnar handflatan ut kurvorna.
3. **Bränn.** Tryck KLAR (eller vänta tills tiden går ut — ugnen väntar
   inte). Alstret glöder i ugnen, får sin glasyr och sitt betyg 1–10 med
   keramikerns kommentar, och ställs på bänken.

Tre alster per kväll: **Skålen** (honungsglasyr), **Vasen** (koboltglasyr)
och **Amforan** (seladonglasyr). Varje alster ger en till tre stjärnor
(60/78/90 % likhet), och sex stjärnor på en kväll låser upp ett fjärde:
**Pokalen** i guldlyster. Poängen räknas på likhet i kvadrat plus
tidsbonus, och rekordet och personbästa per form sparas per enhet.

**Teknik.** Leran är ett radiellt höjdfält lindat till ett lathe-nät som
uppdateras på plats — ihåligt, med rundad läpp, innervägg och botten.
Ateljén ritas med fysikaliskt ljus: bakväggen är en riktig skuggkastare med
ett välvt hål, så kvällssolen kommer in *bara* genom fönstret — strålen
sveper över den våta leran från vänster och lägger en båge av ljus på
golvet. Leran är ett fysikaliskt material med drejränder i en genererad
normalkarta, och varje band har egen fukt: fingrarna lämnar skarpa, blöta
ränder, svampen smälter bort dem och torkande lera tappar glansen. Ett
färgat band mellan din vägg och målets visar live var leran ska tryckas in
(varmt) eller dras ut (kallt), en hand syns där du arbetar — och rycker du
för hårt slår leran. Trycker du KLAR skärs alstret loss och flyger in i
ugnen, dörren slår igen och kontrollern klättrar till 1 240 °C med glöd,
gnistor och värmedaller; ut kommer alstret glödande, svalnar till blank
glasyr medan det plingar och hamnar till sist i fönstret mot Barcelonas
skyline. Alla shaders kompileras bakom laddskärmen så inget hackar mitt i
ett drag. Ljudet syntetiseras: drejskivans brum och lerans våta klafs är
kontinuerliga WebAudio-lager som styrs av hur hårt händerna arbetar, och
ugnen, trådsnittet och glasyrens pling har egna ljud.

**Andra uppgraderingen.** Keramikern är nu en riktig person ur spelens
gemensamma personsystem: linneskjorta med uppkavlade ärmar under ett
lerfläckat förkläde, svart basker och långt brunt hår (håret och baskern är
modellerade i Blender 5.2 och följer huvudet när hon nickar och vrider sig). Hon
pekar på varje ny lerklump, står med armarna i kors och följer dina händer
medan du drejar, nickar när en stjärna trillar in, höjer ögonbrynen vid tre och
rynkar pannan när leran slår. Medan ugnen bränner står hon med händerna i
sidorna; sedan kliver hon fram till drejskivan, lutar sig över alstret med
knytnäven under hakan och fäller domen med hela ansiktet — båda armarna i
luften för en tia, en arm i luften för 8 och 9, tummen upp för godkänt, en
axelryckning för rustikt och en långsam huvudskakning för resten, medan hon
pratar. Din hand på leran har fått riktiga fingrar och en uppkavlad ärm, och
möblerna mjuka kontaktskuggor. Grafiken är härdad för riktiga grafikkort:
skuggkameran omfattar hela rummet, shaderna klarar sig utan NaN, glansen på
den våta leran klampas så att bloom inte fladdrar, och en vakt sänker
upplösningen om datorn inte hinner med.


**Nattens uppgradering.** Lerskulptur fick en grundlig genomgång. Knapparna
Glätta och Klar gick tidigare inte att trycka på, så på mobilen gick det varken
att glätta eller bränna; det är rättat. Handen på leran är helt ny: fingrar med
leder som kupar sig mot leran, en tumme, handled, en underarm som smalnar av
mot handleden och en uppkavlad linneärm. Den trycker på utsidan, och när man
drar ut väggen inifrån sträcker sig armen in över krukans närmaste kant, som
när man sitter vid drejskivan. Leran ger efter under fingrarna med en liten
vulst, blir blankare där handen nyss gått, och slicker stänker av skivan.

Keramikern lägger armarna i kors på riktigt, visar tummen upp och pekar med de
nya händerna, plockar fram en buxbomsskrapa ur förklädesfickan medan hon väntar
och stänger själv ugnsluckan. I mobilens stående läge syns hela hennes huvud när
domen läses upp. Glasyrerna har fått egna ytor – järnprickig honung, flammig
kobolt, krackelerad seladon och glasyr som runnit i droppar mot foten – och
ateljén har fått torkande krukor, glasyrhinkar och ett olivträd.

**Pekkas Fäktning (2023)**

Stockholm, en fäktsal i skymning. Turneringen går mot den riktiga
2023-pallen i stigande svårighetsgrad: Mikael (brons), Rickard (silver)
och mästaren Per Vikman. Först till fem tusch per match.

Duellen bygger på Nidhoggs älskade trelinjesystem och den riktiga
fäktningens fraser:

1. **Gardera.** Tre linjer — HÖG, MITT, LÅG. Din gard i samma linje som
   motståndarens anfall parerar det automatiskt. Klingan blänker i den
   linje anfallet kommer i; de bättre fäktarna byter linje i sista stund.
2. **Ripostera.** En parad får motståndaren att vackla — STÖT i det läget
   är nästan alltid tusch och ger extra poäng.
3. **Finta.** FINT är ett anfall som inte menas. Går motståndaren på den
   binds klingan och en annan linje är öppen. Men att stöta rakt in i ett
   påbörjat anfall slutar illa — den som började har vägrätt.

Varje fras startar med domarens »En garde — klara — kör!«, och varje tusch
tänds i den riktiga målapparaten ovanför pisten: grön lampa och summer för
dig, röd för motståndaren. Poäng: tusch 100, ripost 175, fint-tusch 150,
parad 25, +50 per tusch i rad, matchvinst 500 + 100 per tusch i marginal och
vit match (5–0) +300.

**Teknik.** Fäktarna kommer ur spelens gemensamma personsystem (se nedan)
— mask med galler, jacka med blank lamé, knickers, florett — och poseras
helt i kod: gardvinklar per linje, utfall, parader och vacklanden är
interpolerade poser som läggs på det delade skelettet, inga
animationsfiler. Klingan drar ett additivt spår efter sig i utfallet.

Interiörer står och faller med ljussättningen, och regeln är *hierarki* —
en dominant källa, ett par fills, några accenter, aldrig allt lika starkt:

- **Dominant:** den låga kvällssolen genom bågfönstren, varm och den enda
  som kastar skuggor. Falska volymetriska strålar (halvtransparent
  geometri — tricket som går att köra var som helst) bär in den i rummet,
  med damm som vänder sig inne i dem.
- **Fills:** en kall ovanifrånhemisfär och en frontfill från kamerahållet,
  så fäktarna inte blir silhuetter mot sin egen sal.
- **Accenter:** ljuskronorna, var och en med sken och en ljuspöl målad på
  golvet under sig.

Resten följer av det: fiskbensparketten är blank nog att fånga en
högdager, pisten hårdare, och de panelade väggarna har nog tonvariation
för att mörkret ska ha form. Bakom fönstren ligger ett skymnings-Stockholm
med Stadshusets tre kronor. Ljudet syntetiseras — paradens klingande
klink, målapparatens hårda summer och publiksorlet.

**Uppgraderingen.** Turneringen är nu hela 2023-fältet i ett riktigt
slutspelsträd: du väljer vem av de fem utanför pallen du fäktas som, och
Mikael, Rickard och Per Vikman väntar i kvartsfinal, semifinal och final.
Medaljerna följer riktig fäktning, där båda förlorande semifinalisterna får
brons, och bästa medalj sparas per fäktare. Fäktarna är nu ledade med
inverterad kinematik — fötterna står kvar när kroppen sjunker in i utfallet,
och klingan böjer sig i en båge när den träffar lamén — och varje pose
fjädras, så att fraserna får tyngd och eftersving. Bakväggen har riktiga
fönsteröppningar som kastar solfläckar över pisten, och solstrålarna räknas
fram som en volym genom rummet, med damm som bara lyser där ljuset faktiskt
faller. Varje tusch fryser världen ett ögonblick, kameran går in på
träffpunkten, lampan blommar, lamén lyser i skyttens färg och publiken
reagerar; det avgörande tuschet i varje match visas i slow motion. På dator
spelar du med piltangenterna, mellanslag och F; på telefon med knappar för
tummarna, och i stående läge står kameran bakom din axel.

**Andra uppgraderingen.** Fäktarna är nu riktiga personer ur spelens
gemensamma personsystem: Mikael, Rickard och Per Vikman ser ut som de gör i
alla årens spel, i fäktdräkt med lamé, knickers, strumpor i sin färg och en
mask med galler som man anar ansiktet bakom. Masken sitter i handen vid
saluten och sätts på inför »En garde«, och mellan matcherna står de med masken
av – så att du ser vem du möter. Benen och båda armarna styrs med inverterad
kinematik, florettens spets landar exakt på lamén i träffögonblicket, och
motståndarna är vänsterhänta så att båda klingorna alltid syns. Domaren ropar
ut varje fras med egna gester, och på bänkarna sitter resten av 2023 års fält
och lutar sig fram, jublar, stönar och reser sig för mästaren. Grafiken skyddas
nu mot svarta skärmar och flimmer på riktiga grafikkretsar: shaders kompileras
i förväg, ljusstrålarnas och dammets shaders räknar säkert, ytor som ligger
nära varandra flimrar inte längre, och en vakt förenklar grafiken om bilden
skulle bli svart.


**Nattens uppgradering.** Pekkas Fäktning fick mer verklig fäktning. Fäktarna
håller floretten i ett riktigt franskt grepp med vit handske, kliver med en fot
i taget utan att glida, parerar i rätt linje (sixte, quarte, octave) och
saluterar före och efter varje match med masken i handen innan den sätts på och
tas av. Domaren följer FIE:s tecken: armarna ut vid ”En garde”, ett hugg vid
”Allez”, handen upp vid ”Halte” och sedan armen mot den som fick tuschen, med
paradtecken när det var en ripost, och han sänker armen efter varje tecken.
Publiken lutar sig fram, stönar och applåderar artigt, och mästaren lyfter
Pekkas Pokal vid prisutdelningen.

Dräkterna ser nu ut som tyg: lamén är en matt, silvergrå metallväv med mjuk
lyster, veck och sömmar i stället för en blank krompansar, med en grå krage
runt halsen, och jackan är benvit och byxorna gräddvita med sömmar och
dragkedja i ryggen. Salen fick vägglampetter med levande ljus och sladdar från
fäktarna till rullarna, och pisten blänker mindre i motljuset. Skärmarna mellan
matcherna visar personen de handlar om bredvid panelen, både på dator och
mobil, och i säkert grafikläge (?gfx=safe) är kantutjämningen nu på.

**Pekkas Lerduvor (2022)**

Arnäsvall i augustikväll: sädesfält, granskog, ladugården med vita knutar
— och gänget på fikastolar bakom stationen. En hel runda om 25 duvor:

1. **PULL!** Duvan släpps efter en slumpad fördröjning på upp till ett par
   sekunder — precis som i olympisk skeet. Var redo.
2. **Svinga igenom.** Håll fingret på skärmen och följ duvan; släpp när
   kornet ligger på, så träffar hagelsvärmen där du pekar. På dator siktar
   du med musen och klickar.
3. **Två patroner** per singel, som i riktig trap. Dubbléerna i finalen:
   två duvor i luften, ett skott var.

Tre serier — uppvärmning rakt från graven, korsare från sidorna, final med
dubbléer — och till sist den 25:e: **GULDDUVAN**, liten, snabb och värd
500, med en enda patron. Varje kross i rad höjer streaken; en bom nollar
den. Skjutkortet fylls i uppe till vänster som ett riktigt 25-kort, och
Ludvigs guldrunda från 2022 är spökresultatet att slå.

**Teknik.** Duvan är en fluorescerande orange kupol som krossas i riktiga
3D-skärvor när svärmen tar. Hagelgeväret — en bockbössa sedd från axeln,
med ventilerad ribba, guldkorn, valnötsstock, mynningsflamma och
röksprite — följer siktet och rekylerar in i axeln.

Grafiken vilar på tre saker som all utomhusrendering handlar om:

- **Ängen.** Ett enda `InstancedMesh` med ~23 000 avsmalnande grässtrån
  om sju hörn styck, alltså en draw call. All vind ligger i vertex-
  shadern — tre lagrade frekvenser plus en långsam by som vandrar över
  fältet — och stråna böjs kvadratiskt från en fast rot. Tätheten är
  kraftigt viktad inåt, för gräs ser tätt ut på håll men glest rakt
  ovanifrån, och närmast skjutplatsen är det nertrampat.
- **Luftperspektiv.** Avstånd säljs med blekare och blåare färg, inte med
  fler detaljer: dimman är samma dova varmgrå ton som himlens horisontband
  tonar in i, och den bortre granridån är förtintad mot den ovanpå det.
- **Skuggor.** En skuggkastande sol med tajt ortografisk frustum runt
  stationen. Kontaktskuggor under graven, stenarna och gänget är det som
  förhindrar att allt ser ut som klistermärken på en fond.

Ljudet syntetiseras: skottets knall med ekot som rullar tillbaka från
skogsbrynet, brytvapnets klick-klack vid omladdning, kastarens svisch,
duvans spröda kross — och fågelsång med vindbädd däremellan.

**Uppgraderingen.** Rundan börjar och slutar nu i ett vidvinkelpanorama
bakom gänget på fikastolarna — med Pekkas Pokal på fikabordet, ladugården,
flaggan och den låga augustisolen i samma bild — innan kameran flyger in
till axeln. Himlen är egenbyggd: guldband mot solen, lila-grått från den,
moln med guldkant, dimslöjor över skogskanten och svalor och myggdans som
lyser i motljuset. Haglen har fått flygtid och tar svingen med sig, så den
som stannar bössan skjuter bakom — och efter varje bom visar banan var
svärmen gick: BAKOM, FÖRE, ÖVER eller UNDER, i meter. En kross ger hit-stop,
en orange dammsky och riktiga skärvor som studsar i gräset, och guldduvan
skjuts i slow motion. Ludvigs 3 400 följer med som spökstapel under poängen,
och slutkortet räknar upp poängen, fyller i hela 25-kortet och delar ut
brons (1 800), silver (2 800) eller guld — guld betyder att du slog Ludvig.
Korsarna startar precis utanför bildkanten och deras fart följer bildens
bredd, så en stående telefon ser samma passage som en datorskärm.

**Andra uppgraderingen.** Gänget på fikastolarna är nu de riktiga
deltagarna från 2022: Tobias, Viktor, Rickard och Per Olsson med Ludvig –
mästaren du jagar – på mittenstolen, och Henrik, som arrangerade, står vid
fikabordet med skjutkortet. De dricker kaffe, pratar och vänder sig mot
varandra, och efter varje serie vänder kameran sig om mot dem: jubel för en
felfri serie, applåder för en bra, och Ludvig lutar sig tillbaka med armarna i
kors om det gick sämre. Slår du hans 3 400 applåderar han medan resten av
gänget jublar. Grafiken har också gjorts tålig för riktiga grafikkort: alla
shaders kompileras i förväg för rätt väg, himlen kan inte längre ge svarta
pixlar, och skulle bilden ändå bli mörk trappar spelet själv ner grafiken
tills fältet syns.


**Nattens uppgradering.** Lerduvor fick en ny skogsbryn: granar med hängande
grenvarv i olika höjder och tydliga lager, björkar med vita stammar och luftiga
kronor, sly, enar och mjölkört längs kanten och stenblock med lav. Kvällssolen
lyser in mellan träden i svaga ljusstrimmor, ängen har fått gräsvippor av
timotej och tuvtåtel som fångar solen, ladan har fått locklistpanel och
spröjsade fönster, och på åkern ligger ensilagebalar. Kastgraven är nu en
betongbunker i en gräsvall, och vid skogskanten står ett kasttorn som skickar
två inkommare i serie 2 och en i serie 3.

Gänget håller kaffemuggarna i handtaget med två fingrar igenom och tummen
ovanpå, tar en klunk då och då och höjer dem när någon skjuter bra, och Henrik
håller protokollet plant med tummen ovanpå och skriver med blyerts. Skytten har
fått egna armar med ljusa skinnhandskar som håller i geväret. En träff mitt i
svärmen blir en rökboll, en kantträff slår bara av några bitar, och ett skott
som nästan träffar visar ”Nära!”. På mobilen sitter siktet nu en bit ovanför
fingret, så att man ser duvan man följer.

**Pekkas Pingis (2019)**

**Olympia i Bredbyn** en sensommarkväll — den riktiga spelplatsen. Olympia
är Anundsjö IF:s hus, rest 1938 och på ungefär tusen kvadratmeter, och där
har byn dansat, spelat fotboll och åkt skidor sedan dess. Dansgolvet byttes
i sexmiljonersrenoveringen, så brädorna i spelet är nylagda i ett rum som är
allt annat än nytt. Anundsjö IF spelar i rött — därför är ridån, husskylten
och vimplarna röda, och OLYMPIA står över scenen precis som det gör i
verkligheten. Tre matcher mot 2019 års riktiga
pall — Henrik (brons), Rickard (silver) och Viktor Jones (mästaren) — och
först till 7 med två bollars marginal vinner varje match. Designen lånar
från genrens bästa: Table Tennis Touch-skolans styrning där racketen
följer fingret och **flicken i träffögonblicket är slaget** — uppåt ger
topspin-drive, nedåt backspin, sidled placerar mot hörnen — och Rockstars
Table Tennis-regel att långa dueller ska löna sig: varje slag i rallyt
höjer poängen för den som vinner det, smash-avslut och serve-ess ger extra.

1. **Serva.** Dra och släpp. Bollen studsar på din sida först, som på
   riktigt — serven ärver flickens skruv.
2. **Rallyt.** Du möter bollen *efter* studsen, när den faller tillbaka
   till slaghöjd — du kliver alltså in på korta bollar i stället för att
   vänta bakom bordskanten. En gyllene ring visar var den inkommande
   bollen kommer att studsa.
3. **Motståndarna.** Henrik spelar säkert, Rickard loopar och straffar
   höga studsar, Viktor placerar bort dig och smashar allt.

**Så styrs racketen.** Racketen följer inte fingret rakt av — den dras dit
av en kritiskt dämpad fjäder. Att snappa racketen direkt på fingret är vad
som får ett touch-spel att kännas billigt; fjädern ger den tyngd utan en
fördröjning man känner, och racketens egen rörelsemängd följer med in i
slaget.

**Så spelar boten.** Motståndaren *läser* slaget: i samma ögonblick du
träffar simuleras bollen framåt genom exakt samma integrator som spelet
självt kör, hela vägen till den punkt där han möter den — med gravitation,
luftbroms, Magnuskraft och, avgörande, studsen där topspinnen sparkar
bollen framåt och i sidled. En bot som i stället extrapolerar en rak linje
står permanent fel och ser ut att missa med flit. Farten han behöver
räknas ut ur sträckan och tiden han har på sig, inte ur en fast toppfart,
så en bred boll är svår men inte omöjlig. Och hans misstag är *diskreta*
händelser — nät, långt eller utanför — för en slumpmässig knuff på siktet
äts upp av kanterna och då missar han aldrig.

**Så är svårigheten satt.** Knappen som faktiskt styr hur svår en
motståndare är heter `place`: hur brett han jobbar hörnen. Det som slår ut
en spelare är att behöva *täcka yta*, inte att bollen är välträffad.
`err` — hans rena oprecision — är därför liten för alla, och särskilt för
den svagaste, vilket är precis tvärtemot vad det ser ut att skulle vara:
nedslaget klampas in på bordet, så en stor slumpspridning blir aldrig en
miss, den blir *oförutsägbar placering*, och den är svårare att returnera.
Henrik hade från början tävlingens största `err` och var därför dess
mest obekväma motståndare fast han skulle vara uppvärmningen. En svag
motståndare är svag genom `missP` (han missar på riktigt), `pace` (hans
boll är långsam) och ett litet `place` (han slår tillbaka mitt på bordet).
Han siktar dessutom bara *ibland* bort från racketen — att felvända
spelaren på rallyts samtliga tolv slag är inte hur ett rally ser ut, och
det är enskilt största skälet till att en returnerbar motståndare ändå
känns ospelbar.

Balansen är uppmätt, inte gissad: `scratchpad/pingissim.mjs` spelar hela
matcher headless mot en modellerad människa — racketen jagar bollen med
reaktionstid och ett långsamt vandrande siktfel — på fem färdighetsnivåer
mot alla tre motståndarna, och redovisar vinstprocent och vad poängen
gick på. Hela loopen är dt-driven, så rAF byts mot en virtuell klocka och
`__ppPingis.setRender(false)` stänger av bilden vi ändå inte tittar på;
en match tar då sekunder i stället för minuter.

**Teknik.** Bollen flyger med gravitation, luftbroms och Magnuskraft —
topspin dyker i luften och *sparkar framåt* i studsen, backspin flyter
och bromsar, precis som fysiken i förlagorna. Varje slag går genom samma
lösare: välj nedslagspunkt och flygtid, så följer hastigheten — och
felträffar och våld skjuter nedslaget mot nät eller långt ut. Nätet är
ett riktigt objekt med bandkrypare. Hallen är byggd på ljushierarkin från de andra spelen: tre
pendellampor med fejkvolymetriska koner och målade ljuspölar över bordet,
en enda skuggkastande nyckelljuskälla, en låg fyllnad från spelarsidan så
motståndarens ansikte läses i stället för att bli siluett, månljus och
granar i fönstren, scen med ridå, publik på scenkanten, fikabord och
Pekkas-vimplar. Motståndaren kommer ur spelens gemensamma
personsystem (se nedan), så en sving är en sving och inte en mesh som
glider i sidled. Han studsar på fotbladen mellan slagen, lutar sig åt det
håll han rör sig och följer bollen med blicken. Bollen har
en tajt kontaktskugga (lärdomen från flipperbygget) så den står på bordet
i stället för att sväva. Poängtavlan på väggen fäller sina siffror efter
varje boll.

**Uppgraderingen.** Olympia fyller nu hela skärmen: på en datorskärm ser
kameran hela scenen med ridå, prosceniumbåge och publik längs väggarna medan
bordet förblir motivet, och musen styr racketen rakt under pekaren. Det
nylackade golvet speglar hallen, dammet glittrar i pendellampornas
ljuskäglor och publiken lever — huvudena följer bollen, alla lutar sig fram
i långa dueller, armarna åker upp när du vinner en boll och det blir
knäpptyst på matchboll, när ljuset dras ihop kring bordet. Skruven syns:
spåret bakom bollen, ringen där den studsar och studsmarkören lyser orange
för topspin och lila för backspin, och racketens gummi glöder i den skruv du
är på väg att slå. Smashar fryser bilden ett ögonblick, poängtavlan på
scenväggen fäller sina siffror, och ett långt rally som du vinner spelas upp
igen i slow motion från sidan. Varje motståndare presenteras med ett
scoutingkort, varje vunnen match ger brons, silver eller guld efter
marginalen, och rekord och längsta rally sparas lokalt. Den som slår Viktor
Jones får konfetti från taket, en stående ovation och pokalen som stiger upp
ur bordet. Botens fysik och svårighet är orörda — simuleringen ger exakt
samma utfall som förut.

**Andra uppgraderingen.** Motståndarna är nu tre av kompisarna på riktigt:
Henrik, Rickard och Viktor Jones, byggda med samma personsystem som i alla
andra spel och klädda i Anundsjö IF:s röda tröja, med kanter i brons, silver
och guld efter 2019 års pall. Det som animeras är racketen: den går genom
bakåtsving, den verkliga träffpunkten och genomsvingen, med rätt gummi mot
nätet på forehand och backhand, och armen följer med inverterad kinematik.
Fötterna står kvar och tar steg när han förflyttar sig, servebollen kastas upp
ur vänsterhanden, och ansiktet svarar på poängen: ett leende och en knuten näve
när han vinner, en rynkad panna när han förlorar. I publiken sitter de andra
deltagarna – de följer bollen, lutar sig fram i långa dueller, blir knäpptysta
på matchboll och reser sig för mästaren. Grafiken är dessutom härdad för
riktiga grafikkort: glöden runt små ljuspunkter blinkar inte längre när
kameran rör sig, golvspegeln är mjukare och stabilare, och shaders kompileras
innan första bilden ritas.


**Nattens uppgradering.** Pekkas Pingis fick en ordentlig genomgång.
Motståndarna håller racketen med ett riktigt fattningsgrepp, med pekfingret
längs bladets baksida, och vid serven ligger bollen stilla i den öppna
handflatan innan den kastas upp, som reglerna kräver. Henrik, Rickard och
Viktor har var sitt sätt att fira och ta emot poäng, går in till bordet när
presentationskortet visas och flyttar vikten och den fria armen i slagen. Din
egen racket möter nu bollen där den träffas, och gummit lyser upp i skruvens
färg vid träffen. Hallen är varmare upplyst, publiken lutar sig fram i långa
bollar, tar sig för huvudet vid förlorade poäng och applåderar artigt efter
långa dueller. Golvet har fått gymnastiksalens gamla linjer, slitmärken, en
handduksbox, en bollhink och ett sekretariatsbord med en liten resultattavla.
Reprisen visas från en ny tv-vinkel, och på mobilen visar ett spökfinger hur
serven görs de första gångerna. Reglerna och motståndarnas svårighetsgrad är
oförändrade.

**Pekkas Måleri (2021)**

Trädgården på **Terrassvägen 47** i Örnsköldsvik, lördag 7 augusti 2021 —
måleritävlingen, arrangerad av Per Vikman och Henrik Lundqvist. Reglerna
var enkla: dra en lapp ur en hatt med en konstnär och ett känt konstverk,
och tolka det så gott du kan på ett staffli i trädgården. Sedan dömde en
inbjuden kulturprofil — **Mikael Hägglund** — och gav segern till
**Skriet av Munch**, Olov Melanders tolkning, med motiveringen att han
fångat essensen av mästerverket. Dresscoden var högkulturell profil, och
Per Olsson dök upp som keramikern **Hans Hedberg** i röd basker. Allt det
finns i spelet, inklusive baskern.

Spelet behåller ritualen — hatten, lappen, staffliet, domen — men gör
verbet till det som faktiskt avgör om en kopia läser som originalet:
**färgen**.

1. **Välj yta.** Tavlan är uppdelad i färgfält. Tryck på ett fält, så
   visas målfärgen.
2. **Blanda.** Fem pigment: krapplack, kadmiumgul, ultramarin, titanvit
   och benswart. Mätaren visar hur nära du ligger.
3. **Måla.** Lägg på färgen. Ju närmare målet, desto mer poäng — och
   ytor du inte hinner står kvar som bar duk när Hägglund dömer.

Tre verk per kväll, 95 sekunder styck, betyg 1–10 på vart och ett. Skriet
ligger alltid i hatten eftersom det var verket som vann. Övriga: Mona
Lisa, Nattvarden, Flicka med pärlörhänge och Stjärnenatten. Picasso låg i
den riktiga hatten men är inte med här — hans verk är fortfarande
upphovsrättsskyddade.

**Teknik.** Pigmenten blandas **subtraktivt**, inte additivt. Blandar man
i RGB blir gult plus blått grått, vilket är det enda resultat som direkt
avslöjar att blandningen är på låtsas — så pigmenten lever i RYB och
konverteras till RGB först på slutet, genom Gosset & Chens kub. Gult plus
blått ger då mätbart grönt (0, 168, 51), rött plus gult orange, rött plus
blått lila.

Betyget sätts i **Lab**, inte i RGB. Avstånd i RGB skulle kalla mörkblått
och mörkbrunt nästan identiska och straffa två gräddvita toner som vem
som helst kan skilja på; ΔE under ungefär 6 är en färg ingen skulle kalla
fel, och där ligger full poäng.

**Motiven.** Varje verk är 13–14 ytor definierade som ritfunktioner i en
0..1-kvadrat, vilket gör konsten upplösningsoberoende. Formerna är
Catmull-Rom-splines genom kontrollpunkter, inte polygonlistor — nästan
ingenting i en målning är rakt, och skillnaden mellan en ellips och en
kurva är skillnaden mellan "en gubbe" och Munchs gestalt. Van Goghs himmel
har en egen primitiv: en avsmalnande spiral, för det är virvlarna som gör
att Stjärnenatten läser som Stjärnenatten.

Alla fem är uppmätta mot originalen, inte ritade ur minnet, och det är
kompositionen som avgör om ett motiv läser: Munchs brygga försvinner mot
en flyktpunkt **uppe till vänster** med fjorden till höger — allt på
bryggan (däckets kant, båda ledstängerna, stolparna, de två gestalterna
längre bort) räknas ut från den enda punkten. Vermeers flicka är vänd
bortåt och ser tillbaka över axeln, så ansiktet ligger till vänster i
huvudet och den gula turbansvansen faller nästan hela högersidan. Mona
Lisa har två separata hårfall med det ljusa bröstet emellan — en enda
mörk massa med en spets i mitten gör henne till en nunna. Nattvardens
sidoväggar bär fyra mörka gobelänger var, för utan dem är rummet bara två
grå kilar.

Utöver ytorna bär varje verk ett **tuschlager** — konturer, ögon, munnar,
spröjs, penselriktning — som ritas ovanpå både förlagan och spelarens duk.
Teckningen ligger alltså redan på duken när du börjar, precis som om någon
skissat upp den åt dig, och det är den som gör att ett motiv läser som
Vermeer i stället för som en hög ellipser — utan att kräva att spelaren
målar sextio separata fält.

Samma funktioner ritar tre saker — förlagan, spelarens duk och en id-karta
— så de kan aldrig råka säga emot varandra: ett tryck på duken slår upp
**en pixel** i id-kartan i stället för att testa punkt-i-polygon mot
kurvor. Testet kontrollerar att *varje* yta i *varje* verk faktiskt
överlever in i id-kartan; en yta som råkar bli helt övermålad av en senare
går att se men aldrig att trycka på, och eftersom spelet hoppar vidare till
nästa omålade yta strandar en enda begravd yta hela rundan.

Duken renderas i två lager. Basen — väven, den lagda färgen, penseldragen,
teckningen — är för dyr att rita om sextio gånger i sekunden och ändras
bara när en yta målas, så den byggs om vid behov. Den pulsande markeringen
och dess glödande kontur räknas fram i shadern ur id-kartan, så ingen
textur laddas upp på nytt per bildruta.

**Trädgården.** Himlen är en gradient på insidan av en kupol, inte en
`scene.background`: en enda färg överallt är precis vad en utomhushimmel
aldrig är. Granskogen ligger i tre led, vart och ett blekare och blåare än
det förra — avstånd säljs med färg, inte med mer geometri. Skogen, häcken
och vimplarna ritas som `InstancedMesh` med färg per instans; det är
ritanropen, inte trianglarna, som en telefon-GPU tar slut på. Med statiska
grupper sammanslagna och publiken instansierad ligger trädgården nu på
ungefär 66 ritanrop på dator (73 under domen), från 208.

**Uppgraderingen.** Spelet fyller nu hela skärmen: på datorn hänger förlagan
till vänster om staffliet och paletten står till höger, på telefonen är
paletten ett ark längst ner. Färgen läggs med riktiga penseldrag vars
riktning räknas ut ur ytans form – Munchs himmel får långa vågiga drag, Van
Goghs virvlar spiraler – och duken har en höjdkarta som den låga solen faller
snett över, så impasto, blank olja och linneväv genom tunn färg syns i
ljuset. Paletten är ett trästycke med fem pigmentklickar där varje droppe
flyger ner i blandningen och rörs in i spiraler, och mätaren säger varmare
eller kallare och vad som är fel: för ljus, för grå, fel kulör. Står man
still pekar paletten ut nästa droppe, beräknad som den kortaste vägen till en
träff man faktiskt kan nå genom att bara lägga till färg. Pricka färgen
flera ytor i rad för svit-multiplikator, och vid domen går Mikael Hägglund
fram till staffliet medan din tolkning hängs bredvid originalet, betyget
räknas upp och upp till tre stjärnor delas ut. Ditt bästa per verk och dina
målningar sparas i ett galleri på enheten. Trädgården lever: granar och
björkkronor vajar, vimplarna fladdrar, svalor flyger över häcken och en björk
utanför bild kastar rörliga ljusfläckar på gräsmattan. Tonmappningen är
Neutral i stället för ACES, så duken visar den färg man faktiskt blandat.

**Andra uppgraderingen.** Trädgården har fått riktiga människor: Mikael
Hägglund i svart polotröja och runda glasögon går med anteckningsboken mellan
stafflierna, kommer fram när tiden är ute, studerar duken med pennan mot hakan,
skriver och vänder sig sedan mot dig och säger sin dom – med ett ansikte som
avslöjar betyget innan kortet gör det. Runt omkring målar hela 2021 års fält:
Per Olsson som Hans Hedberg i röd basker och keramikerförkläde, Olov Melander
(vid Skriet förstås), Per Vikman, Henrik Lundqvist och Viktor Jones blandar på
paletten, lägger penseldrag och backar för att titta, medan resten av
deltagarna står vid sina staffli längre bort och applåderar när någon fångar
essensen. Spelet tål också riktiga grafikkort bättre: duken ligger inte längre
millimetern från sin ram, vinden räknas utan stora tidsvärden, shaders
kompileras i förväg och en vakt förenklar trädgården om bilden någonsin blir
svart. Skogen sluter sig nu runt hela trädgården.


**Nattens uppgradering.** Pekkas Måleri fick riktiga saker i händerna: målarna
håller penseln i ett pennfattningsgrepp och paletten med tummen genom hålet,
och Mikael Hägglund håller anteckningsboken i ena handen och pennan i den
andra. Målarna drar penseldragen från axeln, blandar på paletten och tar ibland
några steg bakåt för att se på duken. Fötterna står kvar där de sätts i gräset,
och deltagarnas dukar fylls i medan de målar – Olovs Skriet syns från
trädgården.

Runt trädgården står nu en riktig skogskant med granar i olika höjd, björkar
framför och sly och mjölkört vid foten, och bakom den en disigare rad och en ås
vid horisonten. Gräsmattan har klippta stråk, torrare och frodigare fläckar och
mörkare gräs under häcken och träden, och häcken har fått lövruggar och mörkare
undersida. Huset fick sadeltak med vita vindskivor, bordet en rutig duk och det
står en öl vid ditt staffli. Den som spelar för första gången får palettens
tips nästan direkt, och betyget landar som en stämpel när Hägglund har sagt
sitt.

**Kontroller i flipperspelet**

| | Mobil | Dator |
| --- | --- | --- |
| Flippers | Vänster/höger halva av skärmen (fungerar samtidigt) | ←/→, A/D, Z/M eller Shift |
| Avfyrare | Håll för kraft, släpp för att skjuta | Mellanslag, ↓ eller Enter |
| Nudga | Knappen NUDGA | N |
| Strategikort | ?-knappen uppe till höger | ? — Esc stänger kortet |

Släpp avfyraren när mätaren står i det turkosa fältet för en **skill shot**.
Fältet flyttar sig för varje boll: lågt ger 5 000, mitten 7 500 och högt
10 000. Skjut sedan vänster orbit inom tre sekunder för en **super skill shot**
(15 000). Nudgeknappen blir gul och sedan röd när maskinen gungar, och fyra
snabba nudgar i rad ger TILT: flipprarna dör för den bollen och dess bonus går
förlorad.

**Bordet**

Högst upp står **BORGEN** med torn, port och pokalen på borggården. Två
flippervägar korsar bordet som äkta wireform-ramper: **Kungsvägen** (vänster
rampfil, bredvid vänster orbit) och **Vallgraven** (ett hårt skott i höger
orbit) — bollen lyfter ur spelplanen och åker över borgen till motsatt
inbana. Nedtill finns riktiga **utbanor**: bollen kan rulla ut vid sidan av
flipprarna, precis som på ett riktigt bord. Fysiken är stämd efter en äkta
maskins 6,5°-lutning, så bollen har fart och flipprarna smäller. Varje bana är
bredare än bollen med god marginal, och fastnar bollen ändå någonstans letar
maskinen upp den — först med en skakning, sedan genom att servera om den.

| Moment | Så funkar det |
| --- | --- |
| **Porten** | Tre smällar på borgporten fäller vindbryggan i 12 sekunder. Skjut pokalen medan bryggan ligger nere för att **storma borgen**: 10 000 första gången och 5 000 mer för varje ny stormning, upp till 30 000. Två stormningar tänder en extra boll på Kungsvägen. Porten öppnas också av tänt lås, tänd jackpot, tänd gren, FISKE och FINALEN. |
| **Grenar** | Fäll hela POKAL-banken (P-O-K till vänster, A-L till höger) och skjut in i borgen (eller vänster orbit). Bollen väntar i borgen medan du väljer gren med flipperknapparna: Gokart '12 (varv: orbit/ramp), Femkamp '13, Pingis '19, Skytte '22 (i ordning!), Fiske '24 (pokalen i borgen). Klarad gren = 15 000 plus 250 per sekund som är kvar, och en tänd årsbricka. |
| **FINALEN** | Klara alla fem grenar så tänds Finalen direkt → skjut in i borgen för wizard mode: 60 sekunder multiball där **allt räknas ×5**. |
| **Multiball** | Bumperträffar laddar låset — då öppnas porten och pokalen låser bollar i borgen. Två låsta bollar startar multiball. Jackpotten i pokalen ger 25 000 och 10 000 mer för varje ny; orbits och ramper tänder om den. Första jackpotten tänder add-a-ball på Vallgraven, och efter två jackpottar kan en orbit eller ramp tända **superjackpotten** på 100 000. |
| **Kombo** | Träffar inom 3,5 sekunder kedjar: 1 000 × 2 per steg, upp till ×16. |
| **Snurran** | Vänster orbit går genom en snurra — varje varv ger poäng, och ju hårdare skott desto fler varv. |
| **Knektarna** | När en gren (utom Fiske) eller Finalen startar reser sig två knektar ur borggången och blockerar borgen. Slå ner dem för 3 000 — de reser sig igen efter en stund så länge grenen pågår. |
| **Kickback** | Vänster utbana har en kickback som skjuter tillbaka bollen — tänd vid varje ny boll, tänds om när båda inbanorna rullats. |
| **Ny boll** | Lampan vid avloppet lyser de första nio sekunderna: dräneras bollen då serveras den om — en gång per boll. |
| **Bonus** | Inbanorna höjer bonusmultiplikatorn (upp till ×6) som multiplicerar slutbonusen per boll. |
| **Extraboll** | Två klarade grenar ger en extra boll. |

**Teknik.** Bordet renderas som en riktig *maskin*, inte som ett bräde i tomma
intet: ett skåp med sidoarmatur i polerat stål, ett låsbleck tvärs framkanten
och ett upplyst backglas som står och lyser i bortre änden. Ovanför spelplanen
ligger glaset, och de smala reflexerna av takarmaturen som glider över det är
det mesta av vad som får en flipperbild att läsa som ett fotografi.

Ljuset följer en riktig maskins hierarki. En **halvsfärsljuskälla** ger det
breda ovanljuset, en riktad nyckelljuskälla är den enda som kastar skuggor,
och åtta **GI-lampor** sitter där de sitter på ett riktigt bord — i perimetern
under plasterna och inne i bumperboet — så spelplanen får pölar och avstånd i
stället för en jämn matta. Miljömappen är ett medvetet *mörkt* arkadrum med två
takarmaturer: krom kan bara se ut som metall om det finns något ljust att
spegla och något mörkt att spegla det mot. Det breda ovanljuset ligger i
halvsfären och inte i mappen, för mappen är också vad klarlacken speglar — en
ljus himmel där ger en grå hinna över hela trycket.

Spelplanen är tryck på trä under en tjock klarlack: `MeshPhysicalMaterial` med
`clearcoat` och en genererad slitagekarta för färgens ojämnhet och de fina
repor ett bord får av år av bollar och trasor. Insatserna ligger i frästa
fickor med en mörk kant och en frostad diffusor som blöder ljuset ut på träet,
precis som en riktig insats gör. Bumperkupolerna är genomskinlig plast med
lampan inuti. Bollen har en tajt kontaktskugga så den står på träet i stället
för att sväva.

Punktljus är candela och avtar med 1/d². I bordets skala (≈35 enheter över en
42-tums spelplan) betyder det att en lampa tre enheter över träet behöver en
intensitet i tiotal innan den lägger ut något ljus alls — allt ljus uttrycks
därför som multiplar av `LAMP`.

**Arkadhallen och punktmatrisen.** Flipperspelet fyller nu hela skärmen. På en
bred skärm står maskinen i en mörk arkadhall med neonmatta och två
grannmaskiner – Pekkas Fiske och Pekkas Pingis – och poäng, grenar och
topplista ligger bredvid bordet i stället för ovanpå det. Backboxen har fått en
riktig punktmatris på 128×32 med egen pixelfont. Där visas poängen,
grenstarterna, jackpottar, multiball, bonusräkningen och TILT, och när ingen
spelar rullar attraktionsläget medan lamporna jagar över bordet. Topplistan
sparas på enheten under deltagarnas egna namn. Stora träffar fryser bollen ett
ögonblick och en räddad boll dräneras i slow motion. Gnistor, bollspår och
syntetiska ljud – den rullande kulan, solenoiderna och knackaren vid extraboll –
ger bordet tyngd. På telefon visar bordet vilken skärmhalva som är vilken
flipper, och ingen knapp är mindre än 44 pixlar. Bildupplösningen sänks
automatiskt om bildfrekvensen faller under ungefär 45 bilder per sekund.

**Andra uppgraderingen.** Flipperspelet har fått samma grafikvakt som de
andra spelen: efterbehandlingen ritar i ett format som grafikkretsen faktiskt
klarar, med kantutjämning, och blir bilden svart förenklas grafiken i tre steg
med en notis. Alla shaders kompileras innan första bilden, för den buffert de
verkligen ritas i, så att Windows-datorer inte fastnar på en svart duk.
Insatserna, ljuspölarna och kontaktskuggorna ligger nu säkert ovanför träet även
med grovt djupbuffert, och glimtarna i krom och låsbleck klipps under
bloom-tröskeln så att de inte flimrar. Punktmatrisen glöder med ett eget mjukt
sken i stället för att blinka i bloom-passet, och dimman följer kameran så att
bordet aldrig försvinner i små fönster. Väggarna är hela rundade skenor utan
hål i fogarna, flipprarna har fått riktiga rundade ändar, och förklädet över
avloppet har fått ett tryckt märke.


**Nattens uppgradering.** Flipperbordet har fått en ordentlig uppfräschning av
spelplanen. Slingshots och banguider har plastskivor med tryckt sköldkonst,
stolparna har vita gummiringar, väggarna har rundade kanter och fällmålen är
tunna plattor i rött och guld som fälls rakt ner i en stålkantad springa. En
rad med små lampor ovanför flipprarna visar grenarna och bonus ×, borgen har
fått stenmurar, upplysta fönster och vimplar, och två blixtlampor smäller till
vid jackpot, grenstart och multiball. Varje gren färgar om bordets belysning
och displayen visar en liten animation när en gren startar.

Kulan speglar rummet runt sig och syns som blank stål även på en liten
mobilskärm, ramperna börjar med en genomskinlig plastränna, och avfyrarstången
har fått en fjäder som spänns när du drar. Nya spelare får korta pratbubblor
som pekar på rätt skott under de första omgångarna, nudgen knuffar nu alltid
bollen mot mitten i stället för åt ett slumpat håll, och på mobilen vibrerar
telefonen vid flipper, bumprar och stora händelser. Trots allt nytt ritar
bordet färre anrop än förut, så det håller mobilens prestandabudget.

**Skåpet och borgen.** Flipperspelet har fått ett riktigt skåp, inspirerat av
sena 90-talets medeltidsbord och dagens moderna flipperskåp men med egen konst
rakt igenom. Maskinen står på fyra ben av borstat stål med nivåskruvar, och
spelplanen lutar 6,5 grader mot golvet som på en riktig maskin. Skåpets sidor
har en borg i månsken, riddare, heraldiska fanor, älgvapnet och texten PEKKAS
POKAL. På fronten sitter en myntdörr med upplyst prisskylt (1 krona = 1 spel),
en startknapp och en avfyrare i krom som dras tillbaka när man laddar skottet.
Flipperknapparna sitter på sidorna och en röd knapp på låsbalken. Toppboxen är
en låda med djup och kromram, med en bakbelyst bild över punktmatrisen och två
högtalargaller. Innan man trycker på Start på en bred skärm åker kameran
långsamt runt maskinen i arkadhallen och flyger sedan in till spelvyn. På mobil
i stående läge är spelvyn som förut, och den som har valt reducerad rörelse får
en stillbild. Hallen har fått en bakvägg med varma vägglampor och en neonskylt,
och grannmaskinerna lyser upp mattan framför sig.

Borgen har fått en riktig port: en ekdörr med järnband som spricker lite mer
för varje smäll, skakar på gångjärnen och sprutar flisor, och som vid tredje
smällen faller framåt som en vindbrygga. Skjuter du pokalen medan bryggan
ligger nere stormar du borgen, och det ger mer för varje gång. När en gren är
tänd öppnas porten, bollen väntar i borgen och du väljer själv gren med
flipperknapparna. Varje gren har en egen inledningsmelodi, egna små scener på
punktmatrisen, steg som ger mer och mer och tidsbonus för sekunderna som är
kvar. I multiball blir varje jackpot värd mer än den förra, och slutbonusen
räknas upp rad för rad. Trollen har blivit **knektar**: två vakter i röd
vapenrock och stålhjälm med lysande visir, som reser sig ur borggången med en
hornstöt och klingar till när de slås ner.

Flipperns fysik är omgjord efter mätningar i en testrigg. Flipprarna slår som
riktiga solenoider: snabbt upp, hårdare ytterst och mjukare vid basen. En
uppfälld flipper ger efter lite när bollen träffar, så det går att fånga och
vagga bollen. Bollen kan inte längre passera rakt igenom flippern, och den
rullar fritt längs flipprar och skenor i stället för att bromsas.
Slangbellorna sitter högre och båda målbankarna har flyttats upp, så vänster
orbit, båda ramperna och borgen går att träffa med rätt timing även när målen
står uppe. Popbumprarna och slangbellorna sparkar aktivt med lite slump, ringen
dras ner och gummit slår ut. Ramperna är byggda av fyra ståltrådar med byglar
och stöd, och bollens fart och rullljud följer backarna. Bollsök pulserar
maskinens spolar en i taget, och ljuden kommer från det håll där de händer.

**Personerna i spelen**

Alla figurer i spelen kommer från ett gemensamt personsystem i
`src/games/shared/people*.js`, helt byggt i kod utan modellfiler. Ett undantag:
keramikerns långa bruna hår och svarta basker i Lerskulptur är modellerade i
Blender 5.2, anpassade efter hennes eget huvud och skinnade mot personsystemets
skelett (se `tools/blender/`). Varje
deltagares utseende utgår från ett gruppfoto: Ludvig har rakat huvud och långt
kopparrött skägg, Niklas och Viktor bär keps, och bara Henrik och Viktor har
glasögon – ingen av deltagarna har solglasögon. Var och en har ett eget ansikte
(Olov runt med brett leende, Mikael och Per Vikman långa och smala, Rickard med
fyrkantig käke), ögon med regnbågshinna och glans, skulpterat hår och öron med
riktig form. Kläderna har knappslåar, sömmar och skor med sula.

Händerna har fem fingrar med tre leder var och en tumme som kan föras mot
fingrarna. Med `person.hold(föremål, sida, grepp)` lägger spelen ett racket, en
florett, en pensel, en mugg, ett block, en palett, ett spö eller en boll i
handen, och fingrarna sluter sig kring föremålet i rätt storlek. Gången har
hälisättning och frånskjut utan att fötterna glider, i vila skiftar var och en
vikten på sitt eget sätt, ögonen hinner före huvudet när någon tittar sig om,
och publiken kan luta sig fram, ta sig för huvudet eller applådera artigt.

---

## Utveckling

```bash
npm install
npm run dev      # lokal server på http://localhost:8000
npm run build    # produktionsbygge till dist/
npm run lint     # ESLint
```

### Formgivning

Uttrycket är ett nordiskt pokalrum — en förgylld almanacka snarare än en
instrumentpanel. Tre typsnitt med var sin uppgift: **Fraunces** för rubriker
och siffror, **Schibsted Grotesk** för gränssnittet och **JetBrains Mono** för
koordinater och små data. Guldet är den enda accentfärgen och ritas som
polerad metall (`--metal-gold`, `--metal-silver`, `--metal-bronze`) — allt
annat är varmt grått, så det som glänser betyder något: segrar, medaljer och
det som går att klicka på. Mörkt tema är polarnatt, ljust tema är
elfenbenspapper; sidan följer systemets val tills man själv byter.

Översikten öppnar med pokalen i 3D ([`src/scripts/trophy.js`](src/scripts/trophy.js)):
en svarvad guldpokal på en lackad sockel med varje års vinnare graverad på
mässingsplåtar och föreningens älg etsad på kupan. Det som får metall att se
ut som metall är vad den speglar, så pokalen står i en liten fotostudio —
en mörk kupol med softboxar, ett varmt svep bakom kameran och ett studsljus
från golvet — bakad till en PMREM-miljö. Pokalen laddas efter sidan, ritar
bara när den syns och ersätter en SVG-pokal som redan står på plats, så
inget hoppar och inget saknas utan WebGL. Bakom den ligger höjdkurvor —
Höga kusten, dit koordinaterna i loggan pekar.

Diagrammen visar en deltagare i taget i guld – tryck på en linje eller ett namn
under diagrammet för att följa någon annan – och kurvorna går aldrig utanför de
verkliga värdena; det inställda året 2020 syns som ett skuggat band.
Medaljracet visar när medaljerna kom, år för år, och snittplaceringen är
sorterad med den bästa först. Alla tal skrivs på svenska med decimalkomma, och
texten klarar WCAG AA-kontrast i båda temana. På telefon visar medaljtabellen
guld, silver, brons och totalt på en rad. Innehåll som tonar in när man
scrollar syns ändå från början och vid utskrift. Arkadens affischer är
stillbilder ur spelen och visar en suddig miniatyr tills bilden har laddat.

### Adresser

Varje vy, profil, år och spel har en egen adress. Profiler och år är egna
sidor; bakåtknappen landar där man var i listan man kom ifrån, och spelen
läggs ovanpå så att bakåt eller Esc stänger dem. Knappen **Dela** på års- och
profilsidorna delar en adress som `…/pekkas-pokal/ar/2019/` — en liten statisk
sida som `scripts/share-pages.mjs` bygger vid varje publicering, så att länken
får rätt titel och bild i förhandsvisningen och sedan leder vidare till sidan.

| Adress | Visar |
| --- | --- |
| `#/` | Översikten |
| `#/medaljliga`, `#/historik`, `#/utmarkelser`, `#/statistik`, `#/sangbok`, `#/spel` | Vyerna |
| `#/sangbok/<id>` | En sång, t.ex. `#/sangbok/varat-pekkas` |
| `#/deltagare/<namn>` | En profil: nyckeltal, placering per år, medaljer, utmärkelser och inbördes möten, t.ex. `#/deltagare/viktor-jones` |
| `#/ar/<år>` | Årets sida: pall, alla resultat med Elo-förändring, arrangörer, karta, årets spel och sånger, t.ex. `#/ar/2019` |
| `#/spel/<år>` | Årets spel, t.ex. `#/spel/2024` |

Äldre länkar som `#medals` leder fortfarande rätt.

### Struktur

| Fil | Ansvar |
| --- | --- |
| `index.html` | All markup: de sju vyerna, års- och profilsidan och spelscenen |
| `src/scripts/app.js` | Hela applikationen: dataladdning, statistik, Elo, routing, rendering |
| `src/scripts/trophy.js` | Pokalen i 3D på översikten |
| `src/scripts/achievement-engine.js` | Kör utmärkelsernas regler: vem som har vad, vilket år den låstes upp och vem som är närmast |
| `src/data/achievements.js` | Alla utmärkelser: beskrivning, sällsynthet, poäng och regeln i kod |
| `src/data/achievement-icons.js` | Pekkas egna ikoner för utmärkelserna: en ram per sällsynthet och en ritad symbol per utmärkelse |
| `tests/achievements.test.js` | Tester för utmärkelserna mot de riktiga resultaten (`npx vitest run`) |
| `src/styles/` | `main` (tokens/teman), `layout`, `components`, `pages` (års- och profilsidorna), `animations`, `games` (arkaden och spelscenen), `game-hud` (spelens delade HUD), `responsive` |
| `src/games/shared/` | Delat av alla spel: `gfx` (grafikvakten: tålig efterbehandling, NaN-skydd, svart-bild-vakt, förkompilering, `?gfx=safe`), `people` med `people-*` (personsystemet: skelett, händer och grepp, ansikten, utseenden, poser, gång, publik) |
| `src/games/pinball/` | Flipperspelet: `physics` (2D-kollision), `table` (layout + banans grafik), `meshes` (3D), `cabinet` (skåpet, toppboxen och glaset), `room` (arkadhallen), `showcase` (kameraturen före start), `dmd` (punktmatrisen), `fx` (gnistor, bollspår), `audio` (syntetiskt ljud), `hud` (paneler), `scores` (topplistan), `index` (spelloop) |
| `src/games/fishing/` | Fiskespelet: `species` (procedurella fiskar), `world` (sjö, vattenshader), `scenery` (stranden, udden, speglingarna), `boat` (klinkbyggda ekan), `angler` (Erik i ekan, IK mot spöet), `fx` (stänk, bubblor, glimtar), `hud` (paneler, fångstdagbok), `progress` (uppdrag och rekord), `audio` (syntetiskt ljud), `index` (spelloop) |
| `src/games/clay/` | Drejspelet: `studio` (ateljé, ugn, drejskiva), `hand` (spelarens hand på leran), `clay` (krukans nät och material), `keramiker` (keramikern och domen, hår och basker i `keramikern.glb` från `tools/blender/`), `guide` (målets guider i 3D), `fx` (stänk, glöd, värmedaller), `hud` (paneler, dom, kvällens utställning), `audio` (syntetiskt ljud), `index` (lerfysik + spelloop) |
| `src/games/fencing/` | Fäktspelet: `salle` (fäktsal, ljusvolymer, publik), `fencer` (fäktarna, domaren och masken på personsystemet), `fx` (gnistor, klingspår, konfetti), `hud` (paneler, slutspelsträd), `audio` (syntetiskt ljud), `index` (duell-AI + spelloop) |
| `src/games/shooting/` | Skyttespelet: `range` (fält, lerduvor), `forest` (skogsbrynet), `gang` (2022 års gäng på fikastolarna), `sky` (himmelsshader och moln), `gun` (bockbössan i PBR), `grass` (instansierad äng med vind), `fx` (skärvor, damm, haglsvärm), `hud` (25-kortet, spökstapeln, slutkortet), `audio` (syntetiskt ljud), `index` (banor + spelloop) |
| `src/games/pingis/` | Pingisspelet: `hall` (bygdegård, bord), `foe` (motståndaren och racketen), `crowd` (publiken på personsystemet), `scoreboard` (fällbara siffror), `fx` (bollspår, ringar, gnistor), `post` (bloom, gradering, spegelgolv), `hud` (paneler, scoutingkort), `audio` (syntetiskt ljud), `index` (fysik, AI och spelloop) |
| `src/games/painting/` | Målerispelet: `artworks` (motiven + färgblandning i RYB och Lab), `canvasart` (penseldrag och dukens höjdkarta), `palette` (paletten i 3D), `garden` (trädgården, stafflier), `forest` (skogskanten), `cast` (Hägglund och 2021 års målare), `gait` (fötter som står kvar), `hud` (paneler, dom, galleri), `audio` (syntetiskt ljud), `index` (spelloop och dom) |
| `scripts/share-pages.mjs` | Bygger de statiska delningssidorna (`ar/<år>/`, `deltagare/<namn>/`) med titel och bild för länkförhandsvisning |
| `public/` | Statiska filer: `event.json`, `manifest.json`, ikoner, `brand/` (älgen), `og-image.png`, `games/` (affischbilder), `photos/` |

Data hämtas från `competition-data.csv` vid sidladdning. Om filen inte går att
läsa faller appen tillbaka på en inbäddad kopia i `app.js`, så sidan visar alltid
något.

### Så räknas Elo

Varje tävling behandlas som en serie dueller: alla par av startande jämförs, och
den som placerat sig högst vinner duellen. Alla börjar på 1500 och varje par är
värt `K/(n−1)`, vilket gör att ett år med tolv deltagare inte kan svänga
ratingen mer än ett år med tre.

### Så fungerar utmärkelserna

Utmärkelserna på `#/utmarkelser` är 53 regler som räknas fram ur resultaten varje
gång sidan laddas. Alla finns i [`src/data/achievements.js`](src/data/achievements.js),
där regeln i koden gör exakt det som beskrivningen säger, och
[`src/scripts/achievement-engine.js`](src/scripts/achievement-engine.js) kör dem.

- **Sju kategorier:** Medaljer, Sviter, Milstolpar, Arrangörer, Rivaler,
  Roliga och Titlar. Inga dubbletter: en bedrift som går i steg har en stege
  (vinn 1, 3, 5, 7 upplagor) i stället för flera namn för samma sak.
- **Poängen följer sällsyntheten:** Vanlig 10, Sällsynt 25, Episk 50,
  Legendarisk 100, Mytisk 250. Poängligan på sidan är summan.
- **Egna ikoner** i stället för emojier, ritade för sajten i
  [`src/data/achievement-icons.js`](src/data/achievement-icons.js):
  - **Ramens form visar sällsyntheten**, så den syns även utan färg: cirkel
    (Vanlig), sköld (Sällsynt), hexagon (Episk), rosett (Legendarisk) och
    åttauddig stjärna (Mytisk).
  - **Symbolen** är en guldlinje på ett rutnät på 24×24. Pokalen har samma
    form som 3D-pokalen, Grundaren är en graverad plåt som på sockeln, och
    siffrorna är satta i Fraunces.
  - **Låsta utmärkelser** visas grå med streckad ram, så man ser vad man
    siktar på.
- **Titlar** (The GOAT, Medaljhamstraren, Decenniets mästare, Arrangörskungen
  och Mr. Consistent) har en innehavare åt gången, delas vid lika och kan byta
  ägare efter nästa tävling.
- **Upplåst år:** varje innehavare visas med året utmärkelsen låstes upp
  (för titlar sedan när de har den), också på profilsidan.
- **Närmast:** de som ingen har låst upp än visar vem som är närmast, till
  exempel Guldkungen: Viktor J. 4 av 5. Allt som är låst går att nå.
  Grundaren (med 2011) är den enda historiska och kan inte längre låsas upp.
- **Regler för data:** en upplaga är ett år med tävling (covidåret 2020
  hoppas över, så 2019 och 2021 är två i rad). Bara kända placeringar räknas,
  och sist är bara sist i ett fält på minst fem.
- **Arrangörer:** räknas från kolumnerna Arrangör 3:a och Arrangör näst sist
  för det år de arrangerade.

Testerna i [`tests/achievements.test.js`](tests/achievements.test.js) läser
`competition-data.csv` med samma parser som sajten och kontrollerar reglerna,
poängen och ett antal kända bedrifter (`npx vitest run`). Ett nytt år med en
ny vinnare kan låsa upp nya utmärkelser direkt: vinner Viktor 2027 får han
Hattrick och Guldkungen.

Den gamla versionen hade 77 utmärkelser. Av dem kunde 35 aldrig låsas upp
eftersom de saknade en regel, flera gick till fel person och några var
omöjliga, som ”från utanför topp 20” med tretton deltagare.

### Deploy

Push till `main` kör [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
som bygger projektet och publicerar till GitHub Pages. Inget manuellt steg behövs.
