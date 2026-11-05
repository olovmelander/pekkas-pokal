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
