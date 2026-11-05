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
