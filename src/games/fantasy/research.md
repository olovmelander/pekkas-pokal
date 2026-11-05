# Pekkas Fantasy — 2011

Research och implementation: 5 november 2026.

## Utgångspunkt och källor

CSV-filen anger Fantasy Premier League för 2011, med Rickard Nilsson före Viktor Jones och Mikael Hägglund. Den innehåller ingen sparad FPL-trupp eller historiska spelarresultat. Spelet presenterar därför en fristående arkadtolkning, inte en rekonstruktion av säsongen eller en anslutning till riktiga matcher. Alla fotbollsspelare och klubbar är påhittade.

- [Premier League: FPL basics explained — scoring points](https://www.premierleague.com/en/news/2174909/). Positionsberoende målpoäng, assist, nollor och målvaktsräddningar ger olika roller ett värde. Dessa kärnregler används, inklusive den aktuella regelns 10 poäng för ett målvaktsmål; detta gör inte anspråk på att vara 2011 års exakta regelbok.
- [Fantasy Premier League: Help](https://fantasy.premierleague.com/help). Budget, spelarval, kaptensval, transfers och chips är spelets centrala beslut. Den officiella versionen har fler spelare och en längre säsong; här är formatet medvetet komprimerat.

## Beslut om gameplay

Fem platser (MV, back, två mittfältare, anfallare), 36 miljoner och fem omgångar ger en komplett säsong på några minuter. Spelare har olika kostnad, anfallsprofil, assistförmåga och försvarsstyrka. En färgkodad matchsvårighet samt poängprognos visar varför ett val kan vara bra. Prognosen är ett förväntat värde, inte ett löfte. Samma seed ger samma individuella matchresultat åt samtliga managers, så rivalerna fuskar inte.

Fritt lagbygge inför första omgången; därefter högst ett byte mellan omgångarna. Ett preliminärt byte kan ersättas eller ångras före avspark. Kaptenen ger dubbla poäng; ett engångskort ger tre gånger poängen. Alla spelar hela matchen, vilket eliminerar bänk, skador, transferavdrag och komplicerade minutersgränser i den här korta arkadversionen. Kort, BPS och defensiva bidrag ingår inte. Full poängförklaring finns i spelets utfällbara hjälp.

Matchdagen visar en kort 3D-sekvens med fem individuella resultat, synliga händelser och korrekt kaptenmultiplikator. Resultaten kan snabbspolas utan att poängen förändras. Lika poäng ger samma tävlingsplacering (1, 1, 3) och en delad förstaplats presenteras som delad seger. Miniligans tre rivaler bär namnen från den verkliga 2011-pallen, medan deras fantasylag är designade för arkadversionen.

## Grafik och interaktion

Ett procedurgenererat kvällsstadion: randig gräsmatta, planlinjer och mål med nät, läktare med instansierad publik, strålkastare, reklamskyltar och spelare ur projektets gemensamma figurmodell. Ingen extern bild eller ljudfil. Guld, mörk marin och skogsgrönt ansluter till webbplatsens befintliga formgivning. Laguppställning och marknad ligger i läsbara DOM-paneler, inte text på en svårläst 3D-yta.

Mus och touch använder samma knappar. Tangentbord fungerar med vanliga fokusbara knappar; 1–5 väljer lagplats och C sätter kapten. Stående telefon ger en vertikalt rullbar managerpanel; bred skärm visar trupp och marknad bredvid varandra. Matchen pausar via gemensamt runtime och använder aktiv speltid i stället för fristående timers. Reducerad rörelse stänger av kortens entréanimation.

## Verifiering

`tests/fantasy.test.js` kontrollerar budget, platser och dubbletter, tillåtet spelarbyte, kaptensmultiplikator, poängregler återställning av kaptensval vid ångrat byte, delade placeringar och deterministiska matchresultat för alla spelare över flera säsonger. Integrationskontroll behöver även öppna, spela fem omgångar, spela om och stänga spelet i webbläsare på telefon- och datorstorlek.

## Fördjupad spelbarhetspass

Lagets samlade prognos och kaptensbidrag visas nu direkt ovanför startfemman.
Varje plats visar väntade poäng och matchsvårighet. Marknaden visar upp till
tre kommande matcher och skillnaden mot spelaren som skulle ersättas. Mobilen
har separata lag- och marknadsvyer med en synlig positionsväljare, så ett byte
inte kräver att man letar längst ned bakom hela startfemman.

Rivalerna planerar nu också ett spelarbyte, sin kapten och sitt engångskort.
De följer samma budget och transfergräns och använder bara de offentliga
prognoserna. Framtida matchresultat konsulteras aldrig. En testjämförelse
verifierar identiska AI-beslut för olika resultatseed med samma spelschema.

Matchpresentationen har en femomgångsöversikt och en konkret jämförelse mellan
lagets prognos och verkliga utfall. Säsongens slut visar också kaptensvalens
extra poäng och bästa omgång. Stadion reagerar på resultatraderna med markerad
spelare, riktad bollbana, jublande publik, målreaktion och uppdaterad arenaannons;
riktiga strålkastarljus bidrar till kvällsscenen.

Nya tester verifierar prognosens kaptensmultiplikator, återstående spelschema,
AI:ns lagbudget/ett-byte/ett-kort och utfallsanalysen. En komplett webbläsarkörning
med renderingen avstängd verifierade fem omgångar, mobilens vybyte, transfer och
ångrat byte, trippelkapten, resultat, omspel och stängning utan JavaScript-fel.

De nya vyerna har granskats med riktig rendering i 320 × 568 och 844 × 390.
En klippt fortsättknapp i liggande resultatläge rättades genom att göra
resultatpanelen separat rullbar och hålla knappen synlig; riktig browserklick
verifierade nästa omgång. Matchkameran flyttades in över planen så att
läktartaket inte skymmer spelet. Ett nytt omslag fångades i 1100 × 773 från
den spelbara scenen med strålkastare och matchannons.
