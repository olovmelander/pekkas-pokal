# Flipper — kvalitetsgenomgång

2026-11-05. Den befintliga spelplanen, mekaniska geometrin och fysikkonstanterna behålls.

## Rättade problem

- Webbläsarens `pointercancel` gick genom samma kod som ett avsiktligt fingerlyft och avfyrade bollen. Avbruten kontakt avbryter nu laddningen.
- Tangentbord och skärmpekare kunde släppa varandras flippers. Varje fysisk tangent och pekare äger nu sin kontakt; en flipper släpps först när dess sista kontakt har släppts.
- Strategikortet stoppade fysiken men inte `setTimeout` för bollservering, rundslut och andra övergångar. Alla fördröjningar använder nu den gemensamma aktiva spelklockan. Alla tidsfönster — även super skill shot, porten och knektarnas återkomst — använder samma klocka.
- Fokusförlust rensar laddning och hållna knappar och öppnar pausad strategi. P är en uttrycklig pausgenväg. Esc stänger kortet utan att lämna spelet.
- Rotation under strategipaus tömde renderingsytan utan att rita tillbaka bordet. Storleksändring markerar nu bilden för en omritning genom samma efterbehandling som spelet använder, medan klocka, fysik och fördröjda händelser förblir frysta.
- Laddmätaren visar **SLÄPP NU** och poängvärdet när skill-shot-fältet träffas, med en turkos kant och fyllning. Förklaringen är både text och färg, och täcker inte spelplanen.

## Underlag

[Sterns officiella Godzilla-regelblad](https://sternpinball.com/wp-content/uploads/2022/06/Godzilla-Rulesheet.pdf) visar hur tydligt markerade skill shots och ball-save-fönster hör ihop med spelarens inledande beslut. Här förstärks den redan befintliga regeln; ingen regel från Godzilla kopieras in.

[W3C: Pointer Cancellation](https://www.w3.org/TR/WCAG22/#pointer-cancellation) stöder åtskillnaden mellan en avsiktlig avslutning och en avbruten pekgest. Vår tolkning för avfyraren är att avbruten kontakt aldrig ska kosta en boll.

## Verifiering

- Riktiga Playwright-mus-/tangentbordshändelser: laddning avbryts utan avfyrning; vanlig laddning avfyrar; två tangenter på samma flipper och blandad mus/tangentbord släpper inte varandra.
- Strategikortet håller exakt samma bollpositioner, klocka, räddningsdeadline och antal väntande händelser. Fokusförlust öppnar pausen. Stängning städar instansen.
- Skärmbilder granskade i 1000×740 och 390×844 i grafikens befintliga säkra läge. Spelplanen och kontrollerna ryms i båda.
- `tests/pinball-physics.test.js`: fem laddningsstyrkor går genom den verkliga spelplanens kollisionssystem vid 120 Hz, når överkanten, lämnar skjutrännan och dränerar naturligt utan ogiltiga koordinater.
- `tests/game-clock.test.js`: paus, tidsfönster, avbokning, omstart och städning.
- Rotation under paus är även visuellt kontrollerad mot produktionsbygget: bord och efterbehandling finns kvar och aktiv tid/fas är oförändrade.
- Tre bollar har avfyrats med riktiga Space-händelser genom dränering, bonus, slutresultat, namn/topplista och UI-omstart. Nästa spel börjar med boll 1 och poäng 0. Detta separata funktionstest använder aktiv testklocka utan rendering.

## Nattgranskning 6 november

- Multiballräddningen ersätter nu även den sista synliga bollen och räknar väntande serveringar som bollar i spel. Flera täta dräneringar kan därmed inte avsluta bollen innan redan räddade bollar har återkommit.
- Tilt förbrukar räddningen. Strategipaus tystar hela ljudbussen; nudge ändrar inte spelet under pausen.
- Fyra nya lifecycle-regressioner täcker samtidiga dräneringar, väntande serveringar när fönstret slutar, wireforms/val av gren och tilt. Browsern verifierade tre samtidiga räddningar, paus av kön, återkomst och ett separat naturligt tre-bollsspel via riktiga Space-avfyrningar till resultat, topplista och omstart.
