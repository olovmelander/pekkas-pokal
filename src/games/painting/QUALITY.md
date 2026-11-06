# Måleri: kontroll- och layoutgenomgång

Trädgården, målningarna, pigmentblandningen och juryflödet behåller sin
befintliga visuella utformning. Genomgången rättar problem som upptäcktes vid
spelning och i skärmbilder på telefon och dator.

- Den liggande telefonvyns måla-knapp gick utanför panelen. Handlingsraden
  har nu kolumner som ryms även när panelen bara är 280 px bred.
- Palettens fem pigment har fokusbara, namngivna träffytor och visar hur
  många droppar blandningen innehåller. Mus-/pekanvändning behåller
  mellanslag som måla-genväg; Tab, Space och Enter fungerar som på vanliga knappar.
- Paus och hjälp stoppar aktiv tid, fördröjda domar, animation och ljud.
  Tangenter kan inte ändra blandningen eller måla bakom dialogen.
- En avbruten session pausar vid fokusförlust. Escape lämnar först hjälp,
  paus eller galleri. Upprepade tangentnedtryckningar målar inte flera ytor.
- Redan målade ytor kan inte få nya poäng. Omstart tar bort föregående
  omgångs fördröjda handlingar och visuella poäng-/konfettielement.

Funktionstest genomfördes med verkliga DOM-kontroller och en explicit aktiv
testklocka: pigment, torka med tangentbord, måla, paus/hjälp, Escape, tre
verk till slutresultat, omstart, fokusförlust och avmontering. Renderingen
granskades separat i 1280×800, 390×844, 844×390 och 320×568, inklusive
rotation under paus och upprepad Tab/Shift+Tab. Testklockan finns bara i testets
interception och ändrar inte spelets tidsregler.
