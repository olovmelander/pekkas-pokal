# Bondespelen 2015 — bekräftade grenar och arkadregler

Användaren har i uppdraget bekräftat de fem verkliga grenarna: **luftgevärsskytte**, **vedstapling så högt som möjligt på tid**, **kasta stövel**, **kasta hästsko** och **spika spik så snabbt som möjligt ner i en planka**. Spelet följer denna grenlista. CSV-filen belägger Billsta, 2015 och Per Vikman som vinnare. Exakta historiska antal försök, tidgränser och poängskalor är inte belagda; de anges därför som arkadanpassningar i spelet.

Research läst 2026-11-05:

- [ISSF: Rifle Rules](https://backoffice.issf-sports.org/getfile.aspx?file=ISSF_Rifle-Rules_Book_2023_Approved_Version.pdf&inst=460&mod=docf&pane=1) och [Target Rifle Victoria: 10m Air Rifle scoring](https://www.trv.org.au/sport/scoring.php?target=air10m) ger förlagan med luftgevär, precision och ringtavla. Här används en större, läsbar tavla, tio skott, en mild andningsrörelse och avståndspoäng. Det är inte en ISSF-simulator.
- [National Horseshoe Pitchers Association: Judging](https://www.horseshoepitching.com/gameinfo/judging.html) beskriver en ringer som en hästsko som omsluter pinnen. Vår tredimensionella U-formade hästsko kan landa runt pinnen; ringer ger full arkadpoäng, annars räknas avståndet. Tre olika kastlägen ersätter en fullständig NHPA-match.
- [The Jockey Club: Welly Wanging](https://www.thejockeyclub.co.uk/carlisle/media/news/2017/04/welly-wanging-record-breaker/) beskriver stövelkast som längdtävling. Här avgör utkastvinkel och laddad kraft en ballistisk bana; bästa av tre kast räknas.
- Vedstapling och spikning följer användarens bekräftade mål. De konkreta tidsgränserna, överhängsmodellen och hammarslagens timingfönster är egen speldesign.

## Fem tydligt olika spelmoment

1. **Luftgevär:** sikta i två dimensioner med mus/finger, pilar eller WASD. Tio skott, synliga träffmärken, rekyl och träffljud. Varje skott har ett kort återhämtningsfönster.
2. **Vedstapling:** rörlig ved släpps ovanpå en växande stapel under 30 sekunder. Överlapp bestämmer stabilitet och nästa lagers bredd. Träffar mitt över stapeln återställer lite marginal, missar kostar tid men stoppar inte grenen.
3. **Stövelkast:** välj vinkel och släpp vid rätt kraft. En synlig gummistövel flyger med samma rörelseekvation som avståndsmätningen; kameran följer kastet. Bästa av tre försök räknas.
4. **Hästskokast:** riktning och kraft styr ett precisionskast mot en riktig pinne. Ringern, avståndet och kraftindikatorn gör återkopplingen tydlig.
5. **Spika spik:** fem synliga spikar i en träplanka. Slå nära kraftmätarens mitt för djupare slag; hammaren träffar aktuell spik och flisor hoppar upp. 30 sekunder eller fem färdiga spikar avslutar grenen. Snabbare färdigställande ger bonus. Fem spikar inom 12 sekunder ger full poäng, ett mål som går att nå med 15 rena slag även på en telefon med 20 bilder per sekund.

Alla grenar ger högst 1 000 poäng, sammanlagt 5 000. Turneringen har instruktion före varje gren, resultat mellan grenarna, medalj, sparat rekord och omspel. Grenarna finns i den egna modulen `tournament.js`; 2016 års spel använder fortsatt `shared/country-events.js`.

## Uttryck och teknik

En rödmålad lada, björkar/tallar, halmbalar, mjölkkannor, vagnshjul och glödlampor bildar gården i varmt kvällsljus. Grenarna har egna synliga redskap: luftgevär och ringtavla, barkförsedda vedträn, gummistövel, U-formad metallhästsko och pinne, planka/spikar/hammare. Personerna återanvänder sajtens gemensamma figurmodell. Procedurgenererade träådror, halm, grus och gräs ger ytorna struktur. Den oregelbundna grusgången, svagt kuperad och färgvarierad mark, vindrörda grästuvor och skog i flera avstånd skapar djup. Granarna och björkarna använder samma grenade vegetationsmodell som det äldre Målerispelet; himlen har två lager procedurgenererade moln. Ladan har brädfogar, snedsträvor på portarna, fönster, grundstenar, plåttakets falsar och hängrännor. Hökärra med ekrade hjul, rundade och bundna halmbalar, stavtunnor, mjölkkannor, vattentråg och vedstapel ger gården flera mänskliga detaljer. Den delade 2016-miljön får motsvarande stuga, blomlådor och brygga. Statisk geometri slås ihop per material för mobilprestanda; inga externa bild- eller ljudfiler behövs.

Fem grenmarkörer visar turneringens framsteg. Geväret använder en tryckt tioringad tavla med tydligt sikte. En ljus stödyta visar var veden ska landa och blir grön vid ren placering. Stövelns streckade förhandsbana följer samma fysik som själva kastet. Hammarmätaren glöder när timingen är rätt. Hästskon är en fasad stålform med faktiska sömhål; hammare, spik och gevärspipa återger miljön med metallmaterial. Varje gren har en egen kamerakomposition för stående mobil och större skärm.

Stora pekknappar och tangentbord använder samma spelregler. Mobilen kan dra gevärssiktet direkt på tavlan och har extra upp/ned-knappar. Paus och fokusförlust nollställer hållna kontroller. Spelets resurser och lyssnare städas vid stängning. Reducerat grafikläge följer den gemensamma spelmotorn.

## Verifiering

`tests/farm-five.test.js` verifierar luftgevärspoäng, stövelns kraft/vinkel och samstämmighet mellan bana och landningsavstånd, samt ringer/avståndspoäng. `tests/farm-wood.test.js` verifierar vedstabilitet, spikdjup och poäng. `tests/farm-games.test.js` behåller regressionstester för 2016 års gemensamma regler.

Grafiklyftet kontrollerades 2026-11-05 i Chromium med ordinarie skuggor och miljöreflektioner: samtliga fem 2015-grenar samt den delade 2016-miljön på dator, stående telefon och liggande telefon. Inga JavaScript- eller shaderfel rapporterades. Ett omtag efter att viewportens resize hade slutförts verifierade stövelvyn på telefon. Båda världarna byggdes dessutom utan WebGL och kontrollerades för ogiltiga vertexvärden och fel vid geometrisammanslagning; inga hittades. De 13 regeltesterna för bondespel/ved och 2016 passerade, liksom riktad ESLint och diffkontroll.
