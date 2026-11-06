# Pekkas Triathlon · Lomsjön 2017

## Underlag och tolkning

`competition-data.csv` bekräftar Triathlon i Lomsjön den 5 augusti 2017, med
Viktor Jones, Per Vikman och Mikael Hägglund på pallen. Underlaget anger inte
sträckor, bana eller lokala regler. Användaren har därefter angett ordningen
**simning → löpning → cykling** för 2017. Spelet följer den uppgiften direkt;
det är användarens historiska uppgift och inte en slutsats från sportens
standardregler. Spelet är i övrigt uttryckligen en
arkadtolkning: spelaren är Viktor, med Per, Mikael och Tobias som rivaler.
Det återger inte en dokumenterad bansträckning eller historiska tider.

Research gjord 2026-11-05:

- [World Triathlon: Talk Like a Triathlete](https://triathlon.org/talk-like-a-triathlete)
  beskriver standardformatet simning–cykel–löpning, T1/T2, orientering mot bojar,
  och drafting som energibesparing bakom andra cyklister i draft-legal-lopp.
  Därifrån kommer inspiration till simpoäng och läbonusen, men standardordningen
  används inte: den lokala ordningen ovan har företräde. I spelet betyder T1
  simning → löpning och T2 löpning → cykling.
- [World Triathlon: Training Tip — Pacing the Swim](https://triathlon.org/news/training-tip-pacing-the-swim)
  betonar att för hård öppning kan försämra resten av loppet. Det ligger bakom
  en gemensam energireserv genom hela tävlingen. Sökresultatets sammanfattning
  användes; den fullständiga sidan gick inte att hämta i verktyget.
- [USA Triathlon: Draft-Legal Racing](https://www.usatriathlon.org/multisport/draft-legal-racing)
  skiljer den tillåtna draftingformen från motionslopp där den är förbjuden.
  Introtexten säger därför uttryckligen att detta spel har tillåten drafting.
  Sökresultatet gick att läsa; fulltextåtkomst gav HTTP 403.

## Speldesign

Ett lopp tar ungefär 90–105 sekunder. De tre etappernas distanser är
arkaddistanser, inte officiella tävlingsdistanser. Styrningen är densamma genom
hela loppet: välj linje med vänster/höger och håll tempoknappen för högre fart.
Spelaren kan alltid släppa knappen för att återhämta energi. Tömning ger en
kort återhämtningsperiod med hysteres, så snabba knapptryck inte kringgår
utmattningen. Vanlig fart räcker alltid för att nå mål.

Simningen premierar rena linjer genom guldringar och har mild sidoström.
Löpningen följer därefter med vattenflaskor, hinder och energi att spara till
cyklingen. Cyklingen avslutar loppet och premierar positionering i rivalernas
lä och en välplanerad slutspurt. Orange bommar kostar energi och fart. Misstag
avslutar aldrig loppet. Tydliga etappkort ger en andningspaus, instruktioner och
mellantider. Omspel premieras av tid, precision, pickups och lokalt rekord.

## Grafik och tillgänglighet

Samma Three.js-version, personsystem, helskärmskontrakt och svenska HUD som
övriga spel. Procedurscen med rörligt vatten, skog i instanserade meshgrupper,
dimhöljda kullar, stugor, brygga, vimplar och målportal. Atleterna simmar,
trampar cyklar med rörliga hjul och springer med separata poser. Varmt ljus,
turkost vatten och guld på spelaren gör orienteringen tydlig.

Telefonkontrollerna har stora tryckytor och pointer capture; pointercancel,
blur, paus och växling släpper alla hållna kontroller. Tangentbord använder
pilar/A/D och mellanslag/W. Porträttkameran dras tillbaka för att bevara hela
banbredden. Delad runtime sköter paus, ljud av/på, kvalitetsnedtrappning och
resursstädning. Poängregler och energi simuleras oberoende av bildfrekvens.

## Kvalitetsgranskning och andra designpasset

Rivalerna följde tidigare spelarens aktuella disciplin och placerades med en
linjär tredjedel av totaltiden. De följer nu egna sim-, löp- och cykelsplittar,
med små individuella styrkor och avsedd totaltid. Bara en cyklist på samma gren,
framför spelaren och på samma linje ger lä. Spelarens visuella sidoläge används
också som kollisionsläge, och flera samtidigt hållna tangentbindningar släpper
inte varandra. Tempot växlar mjukt; riktningsbyte har kort, konsekvent inbromsning.

Hela den lokala miljön rör sig kontinuerligt längs en 800 m lång bana. Den gamla
skogen hoppade tillbaka var 32:e meter medan hus och stenar stod stilla. Nu
stämmer parallaxen mellan markeringar, stränder, hus, skog och föremål. Sjön
har bredare öppet vatten, bojbana, båtar som gungar och badbryggor. Löparspåret
har närmare björkkronor, stockar och löv; cykelsträckan öppnar mot inhägnade
blomsterängar. Funktionärer vid vätskestationerna använder originalspelens
animerade människomodell. Ljudknappen och pausen styr även den svaga cykelstämman.

Rena simringar i följd och omkörningar ger tydlig återkoppling. Kontrollerna
benämns efter aktuell aktivitet: kraftiga tag, öka steget och trampa hårdare.
Resultatet visar fortsatt alla tre splittar i den användarbekräftade ordningen
simning, löpning, cykling samt längsta obrutna sviten av simringar.

## Grafiskt miljöpass

Miljön jämfördes med `fishing/world.js` och `fishing/scenery.js` för sjöns
reflexer och granitstrand, `shooting/grass.js` för växtlighetens ljus och
`painting/forest.js` för grenverk, björkbark och genomlysta lövkronor.
Scenen använder nu samma detaljerade växtfamilj genom `shared/scenic.js`,
med förenklade bakre trädrader och separata 32-metersgrupper för synlighetsurval.
Löparsträckan får en extra nära björkkrona; cyklingen öppnar mot staket och äng.

Sjön har en bredare, oregelbunden och höjdsatt strand. Vattenytan kombinerar
små korsande vågor, flera skalor av brus, betraktningsberoende himmelsreflex,
bruten solglitter och ljusare grunt vatten. Reflektionen är en billig analytisk
tolkning av himmel och skog, inte en andra rendering av hela världen. Den
upprepade randningen i den tidigare ytan är borttagen. Granitblock, växande
gräsfläckar, öppna träekor, förtöjningar, bryggstolpar och badstege ger skala.
Stugorna har stående panel, spröjs, fönsterbleck, grundsten och skorsten.

Landsväg och grusled använder korniga material med större fukt-/färgvariation
på banans koordinater. De är sammanhängande genom samma 800-metersvärld som
rivaler och banföremål; ingen dekor hoppar tillbaka nära spelaren. Moln,
dimma och tre bakre åsryggar bygger djup. Solriktningen delas av himlen,
vattenreflexen, vegetationen och den riktiga skuggljuskällan. Art direction är
en svensk sensommarsjö, inte ett påstående om Lomsjöns dokumenterade strand
eller bebyggelse. Regler, lokala grenordningen och kollisionsytor är bevarade.

## Simstartens läsbarhet

Bildgranskning visade att Tobias och spelaren startade i samma sidospår och
att deras simtag gick genom varandra. Rivalerna har nu särskilda simspår med
plats för hela armrörelsen, även efter lång väntan på startpanelen. Ett prov
med de verkliga animerade figurernas sidogränser kontrollerar minst 18 cm
marginal. Simspåren ligger stilla i sidled; själva simtaget rullar kroppen.
Det samlade startfältet ryms även på en 320 px bred telefon. Spelarens svaga
ström åt höger ryms också.
Löpningens och cyklingens spår, drafting, rivalernas fart och måltider är
oförändrade. Fri styrning kan fortfarande föra spelaren genom en rival senare
i loppet; startjusteringen inför inga personkollisioner eller tidsstraff.
