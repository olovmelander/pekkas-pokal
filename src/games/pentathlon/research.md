# Femkamp och Parkmästare: research och design

## Historisk avgränsning

`competition-data.csv` anger **Femkamp, Kroksta, 2013** och **Mångkamp Uppsala,
2014**, men inga delgrenar eller regler. Båda spelen är därför uttryckligen
märkta **arkadtolkning** på startskärmen. Grenarna och miljöerna är spelmässiga
tolkningar, inte rekonstruktioner av dokumenterade arrangemang. Erik Vallgren
vann båda de verkliga tävlingarna. Det gemensamma personsystemet återanvänds så
att deltagarna känns igen från de befintliga spelen.

## Lästa primärkällor, 5 november 2026

- [World Athletics: Long Jump](https://worldathletics.org/disciplines/jump/long-jump):
  avstamp bakom plankan och övertramp är centrala precisionsmoment. Spelet
  behåller denna risk, men förenklar själva ansatsen och använder tre försök.
- [Croquet England: Basic Rules of Golf Croquet](https://www.croquet.org.uk/?p=games%2Fgolf%2Frules%2FgcBasicRules):
  bollen måste passera rätt båge i rätt riktning. Parkmästare använder tre
  bågar i följd och sex slag som en kort träningsutmaning, inte en fullständig
  match enligt förbundets regler.
- [World Croquet Federation: The Rules of Golf Croquet](https://worldcroquet.org/croquet-information/golf-croquet/the-rules-of-golf-croquet/):
  regelöversikt och avgränsning mot andra krocketvarianter.
- [Pétanque England: Learn to Play Pétanque](https://www.petanque-england.uk/assets/downloads/learn-to-play-petanque.pdf):
  närhet till lillen är den tydliga grundidén. Här blir det tre kastlägen med
  poäng efter avstånd; det är en precisionsutmaning med ett referensklot,
  inte en regelrätt match till tretton.

## Spelbeslut

2013 har fem olika färdigheter: **ringkast** kombinerar riktning och kraft,
**häcklopp** testar rytm och framförhållning, **prickkast** låser ett rörligt
sikte i två steg, **längdhopp** belönar ett sent men giltigt avstamp och
**balansgång** kräver små kontinuerliga korrigeringar mot vind. En gren ger
högst 100 poäng. För längdhopp räknas bästa försöket; för precisionskasten
räknas medelvärdet. Man blir bättre genom återkoppling, inte knappspammning.

2014 är en långsammare trädgårdscup med **boule**, **krocket** och **ringkast**.
Krocket testar den verkliga segmentpassagen genom bågen, inte bara om bollen
slutar nära målet. Missade slag återgår till sin utgångspunkt; denna avsiktliga
arkadregel står i instruktionen och hindrar att en nybörjare fastnar bakom en
båge. Sex slag ger utrymme att lära sig kraft och vinkel.

Varje gren har en egen instruktion innan start, omedelbar ljud- och textrespons,
resultat mellan grenarna, medalj, lokalt personbästa och omspel. Guld kräver
80 poäng i snitt, silver 55 och brons 30. Samma trösklar fungerar för båda
turneringslängderna.

## Bild, kontroller och teknik

Kroksta är en varm svensk sommaräng med röd stuga, träd, gärdsgård, höbalar,
vimplar och picknickbord. Uppsala får en formell park, grusplan, klippta häckar,
pastellfasader och en stiliserad silhuett med två torn. Allt är procedurgenererad
Three.js, med samma mjuka karaktärer, gyllene typografi och HUD-skal som resten
av arkaden. Inga externa foton eller ljud laddas. Kameran ramar om scenen för
stående telefon och bred skärm; stora touchknappar och tangentbord ger samma
handlingar. Pekare som avbryts, sidbyten, fokusförlust och paus släpper hållna
kontroller. Spelet rensar lyssnare, animationer, ljud, 3D-resurser och personer
när det stängs.

Gräs, grus, trä och löv har fyra delade, deterministiskt genererade ytor. En
enkel himmelskupol ger en varm horisont och ett svalare himlavalv. Parkens
statiska geometri slås samman per material så att träd, staket och blommor
inte kostar var sitt ritkommando på telefonen; rörlig utrustning hålls separat.

`tests/field-games.test.js` verifierar avståndspoäng, övertramp, krocketbågens
riktning och öppning, medaljgränser samt kraftmätarens cykel.

## Kvalitetsgenomgång

Den första spelbara versionens vida kamera gjorde målen för små på telefon.
Varje gren har nu en närmare kamerakomposition; häcklopp och balans följer
personen och krocket följer bollen mellan bågarna. Landskapet har mjuka
höjdskillnader, fjärran kullar, oregelbundna trädkronor med grenar, varierat
gräs, bänkar, blomkrukor och avgränsade banor. Detaljerna ingår fortfarande
i materialbatcherna i stället för separata ritkommandon.

Precision bygger på begriplig återkoppling: en prickad bana visar kastet,
ringen får full poäng när den omsluter pinnen, och boule säger både avståndet
och om klotet kom närmare än referensklotet. Krockets vinkel hålls konstant
när kraften ändras. Tidigare flyttade högre kraft även riktningen, vilket
gjorde siktet missvisande. Längdhopp mäts nu från plankan till den faktiska
landningen, och metertalet skrivs ut tillsammans med poängen. Häckloppets
”hoppa nu” ligger inom den giltiga hoppperioden. Balansvinden börjar mjukare.

Resultatvyerna visar separata grenrader och medaljgränser. Delade
marktexturer behålls mellan grenarna; endast grenens egna skylttexturer
städas vid grenbyte. Regeltesterna täcker också riktningsstabil krocket,
att alla tre bågar kan nås och att redovisad hopplängd stämmer med landningen.

Grafikpasset efter den första kvalitetsgranskningen återanvänder Måleriets
förgrenade björkar/granar, lövljus och vind via `shared/scenic.js`. Rabatterna
har instansierade stjälkar, blad och blomkransar; låg blomning vid spelplanens
kant syns även på telefon. Trädgården kompletteras av oregelbunden sten,
väderbitna gångkanter, veranda med räcke och luckor, redskapsställ, handpump
och träpergola. Byggnadsdelar och rabatternas kanter sammanfogas per material.
Detta är scenografiska val för arkadtolkningen, inte historiska källuppgifter.
