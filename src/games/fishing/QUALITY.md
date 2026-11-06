# Fiske — kvalitetsgenomgång

2026-11-05. Sjön, fiskarterna, kastens tre faser och deras befintliga grafik är bevarade.

## Rättade problem och förbättringar

- Strategikortet och fångstdagboken stoppade djupet men lät fiskarna simma vidare. Nu fryser hela spelvärlden och den aktiva klockan: samma lucka mellan fiskarna väntar när kortet stängs.
- Fördröjda perfekt-kast-bonusar och rundslut kördes tidigare under kort eller i en bakgrundsflik. De delar nu spelklockan med resten av spelet och rensas vid omstart/stängning.
- Den extra multiplikatorn för en snäv passering försvann vid nästa vanliga väjning. Den räknas nu in i alla senare multiplikatorvärden under kastet. Bottenbelöningen ger den fulla multiplikator på uppvägen som reglerna lovar.
- Ett perfekt kast kunde nekas när en tidigt fångad fisk redan hade slutfört tunnans animation. Alla säkrade fiskar räknas nu, även de som redan landat. Sista säkringen avslutar slow motion så att fisken hinner fram innan rundkortet visas.
- Fångstens träffområden i luften räknas i CSS-pixlar och är cirkulära i både stående och liggande format. Den tidigare beräkningen gav olika horisontellt och vertikalt mått på telefonen.
- Styrning släpper vid avbruten pekgest/fokusförlust. P pausar; Esc stänger hjälp/dagbok utan att stänga hela spelet. Styrning bakom ett öppet kort ignoreras.
- En kompakt **VÄJ · NERÅT / FÅNGA · UPPÅT**-etikett ligger kvar efter fasförklaringen, så regelbytet alltid går att läsa. En ny fas ersätter också den gamla etikettens timer.

## Underlag

Den ursprungliga referensen är utvecklarens [Ridiculous Fishing](https://ridiculousfishing.com/). Genomgången fokuserar på den befintliga motsättningen mellan att undvika och samla; den inför inget ytterligare moment som stör den loopen.

[W3C:s förklaring av målstorlek](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) motiverar att pröva pekmål i CSS-pixlar. De osynliga spelmålen här är 44–68 pixlar i diameter, med korrekt bildförhållande, i stället för en bildskärmsberoende oval. Detta är en förbättring av inmatningen, inte ett påstående att hela spelet är tillgänglighetscertifierat.

## Verifiering

- Riktiga tangentbordshändelser styr draget. Hjälpkortet håller djup, fiskpositioner och spelklocka oförändrade. Skärmbilder har granskats på dator och stående telefon, med både ordinarie grafik och befintlig säker grafikväg.
- En verklig muspekning på en projicerad luftburen fisk registrerar säkringen. Testet måste vänta två animationsrutor efter en avsiktlig testfrysning, så att fisk och kameramatris hunnit synkroniseras.
- Ett avslutat kast hålls kvar under paus; bonusen finns kvar och rundövergången fortsätter efter paus. Övergångskontrollen kördes utan rendering för att undvika att samtidiga programvaru-GPU:er påverkar testtiden.
- Tre kast med nio säkrade fiskar gick genom bonusar, slutresultat, sparat rekord och kvällsräknare. Den riktiga Fiska igen-knappen återställer kast 1, poäng 0, stjärnor 0 och en tom session.
- `tests/fishing-rules.test.js`: kvarstående snävpasseringsbonus, full bottenmultiplikator, perfekt kast och runda pekmål i fyra skärmformat.
- `tests/game-clock.test.js`: fördröjningar under paus, avbokning och städning.

## Nattgranskning 6 november

- Alternativa styrtangenter och samtidiga pekare äger nu separata kontakter; en släppt kontakt avbryter inte en annan. P-repeat växlar inte pausen.
- Paus och mute styr hela ljudbussen. Mute fungerar därför även med fångstdagboken eller strategikortet öppet och består efter återgång.
- Verifierat med riktiga tangentbordshändelser, ljudbussens nivå, nio projicerade pekträffar, tre perfekta kast, slutresultat och omstart. Fyra ljudregressioner prövar paus/mute-kombinationerna för både fiske och flipper.
