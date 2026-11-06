# Pekkas Ambition — research och spelbeslut

Läst 2026-11-05. Repositoriets tävlingsdata anger **Kortspel Ambition,
Kungsholmen, 2018** men saknar husregler. Spelet anger därför uttryckligen
att detta är en kort arkadtolkning, inte en verifierad rekonstruktion av kvällen.

## Källor

- [Pagat: Ambition](https://www.pagat.com/invented/ambition.html) identifierar
  Mike Church som skapare och länkar hans regeldokument. Kärnan är ett
  stickspel för fyra där tvåan kan slå honnörer och för många poäng är riskabelt.
- [Skaparens regeldokument](https://docs.google.com/document/d/1S7lsZKzHuuhoTb2Wj_L3zrhHZh5IEKBDf56ExgErv4o/edit)
  kunde identifieras men själva innehållet gick inte att läsa med researchverktyget.
- [CatsAtCards: How to Play Ambition](https://catsatcards.com/Games/Ambition.htm)
  anger uttryckligen skaparens tillstånd att återge reglerna. Det är källan för
  poängvärden, färgtvång, det blinda rutersticket, tvåans specialregel och
  poängräkningen: slam vid 51, nil för noll stick och noll utdelning för flest
  tagna poäng eller under 10.

## Tydliga anpassningar

Matchen är **tre givar**, inte först till 100. Kortbytet roterar vänster,
höger, tvärs över. Fyra spelare får hela leken, 13 kort var, och byter tre
innan första sticket. Ingen budgivning: den tillhör inte det här belagda spelet.
Alla givpoäng visas öppet. Motståndarna använder endast egen hand och offentlig
information, och väljer sitt blinda öppningskort före spelarens val.

## Gameplay och uttryck

Spänningen ligger i att väga ett säkert stick mot risken att ta flest poäng.
Tvåans omslag och klöverkungens höga värde skapar minnesvärda vändningar.
Automatiskt färgtvång, markerade val, kortens poängetiketter, konkreta förklaringar
efter varje giv och ett hjälpblad gör reglerna begripliga under spelet.

Salongen byggs i Three.js med grönt spelbord, mässingsdetaljer, trägolv,
stearinljus, kaffekoppar, fönster mot en stiliserad Stockholmssilhuett och
motståndare ur det befintliga personsystemet. Korten ritas i HTML/CSS för skarp
text och riktiga tangentbordsstyrda knappar. Mobilen får en hand i två rader;
liggande skärmar får en kompakt layout. AI och animationer stannar vid paus
och reglerna kan läsas utan att turerna fortsätter.

## Verifiering

`tests/ambition.test.js` kontrollerar obligatorisk färg, tvåans specialfall,
öppningssticket, slampoäng, delad topp, noll stick kontra noll kortpoäng,
samtidiga byten och kompletta AI-givar med bevarade 52 kort och 80 givpoäng.

Webbläsarkontroll: 39 mänskliga kortval över alla tre givar på 390 × 844,
resultat, omspel, regelblad, paus/fortsätt, byte till 844 × 390 och stängning
utan kvarvarande canvas. AI-väntetider accelererades endast i testets
nätverksinterception. Inga JavaScript-fel registrerades. Normal desktop- och
landscape-smoketest passerade också. Skärmbilder granskades visuellt.

## Fördjupad spelbarhetspass

Kort väljs nu först för granskning och bekräftas med **Spela**. Förhandsvisningen
använder bara redan öppna kort; de tre dolda öppningskorten påverkar aldrig
informationen som visas. Bordet anger utspelad färg och synlig poängpott.
Den egna poängzonen förklaras löpande och ett sista kort i sticket kan visa
den exakta konsekvensen av att vinna det. Det ändrar inga poängregler.

AI:n undviker numera ett dyrt stick som skulle förvandla en betalande mellanplats
till straffet för flest poäng. Den ser fortfarande bara sin egen hand och
öppna kort. En givöversikt visar de tre delresultaten. Spelaren kan låta
sticket ligga kvar en liten stund eller gå vidare direkt. Vinnaren reagerar
vid bordet och poängmarker rör sig mot vinnarens plats.

Handen kan navigeras med vänster/höger, Home/End och Enter. Fokus hålls kvar
över turbyten. Regelbladet har dialogsemantik, eget fokusvarv och stängs med
Escape. Mobilens kortlayout och den låga liggande layouten har egna mått.

Nya tester täcker information som inte får läcka i det blinda sticket,
förhandsvisningens exakta sista-kort-fall, poängzoner och AI:ns riskval.
En komplett webbläsarkörning med renderingen avstängd verifierade 39 bekräftade
drag, tre givar, givöversikt, resultat och omspel utan JavaScript-fel.

De nya vyerna har därefter granskats med riktig rendering i 320 × 568 och
844 × 390: kortval, bekräftelseknapp, tydlig pott, regelblad och Escape-beteende.
Ett nytt omslag fångades i 1100 × 773 från den spelbara 3D-scenen. På större
skärmar använder salongens tre personer nu högre detaljnivå; mobil behåller
de lättare modellerna. Textilväv och solfjädrar av kort tillför bordsdetaljer.

## Visuell fördjupning: kortsalongen

Rummet följer samma material- och ljushierarki som de befintliga
keramik- och fäktningsinteriörerna: en tydlig varm huvudbelysning,
svalare fönsterljus, små praktiska lampor och miljöreflektioner som gör
mässing, glas och porslin läsbara. Material och inredning genereras
lokalt. Parkettens varierade träådring, vävd filt, läderkant, matta och
mönstrad tapet får egna texturer; de dekorativa ytorna omger en lugn
spelyta. Stockholmspanoramat, gardinernas veck, bokband, klocka,
vinnarpokal och kaffe-/teservice ger platsen identitet utan att
påverka kortens poäng eller dölja spelkontroller.

Statisk geometri slås samman per material. Personer, stearinljusens
lågor och poängmynt är separata för animation. Mobil får enklare
figurdetaljer och en något vidare kamera; kort och beslut förblir
vanliga DOM-kontroller med samma regler, förhandsvisning och
bekräftelsesteg som tidigare. Normal WebGL-rendering har kontrollerats
på dator, stående mobil och liggande mobil, utan shaderfel eller
dokumentöverflöde.
