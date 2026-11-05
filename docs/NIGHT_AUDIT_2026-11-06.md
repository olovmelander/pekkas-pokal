# Nattgranskning av Pekkas Pokal, 6 november 2026

## Uppdrag och utgångsläge

Användaren har bett om självständig audit, iteration och förbättringar av
alla spel fram till 07:00 svensk tid, utan frågor, samt en sammanfattning
på morgonen. Tidsgräns: **2026-11-06 07:00 Europe/Stockholm (06:00 UTC)**.
Arbetet fortsätter på `feat/complete-historical-arcade`, i
[utkast till PR #99](https://github.com/olovmelander/pekkas-pokal/pull/99).

Basen för nattpasset är `49fa4c5943420a1d853bbf972c0fe16f8beb501c`.
Den innehåller alla 15 spel, det större grafiklyftet för 2011–2018 och
Varggropens avlästa 665-metersbana. Basens verifiering: 123 enhetstester,
24 nya browserkombinationer, bygg och delningssidor godkända; ESLint har
0 fel och befintliga stil-/komplexitetsvarningar. Dessa tidigare resultat
ska inte förväxlas med verifiering av nattens kommande ändringar.

## Arbetssätt

- Sök reproducerbara problem i faktiska spel, inte ändringar för sakens skull.
- Prioritera korrekt spelmekanik, känsla, återkoppling, läsbarhet och stabil
  mobil-/tangentbordsstyrning. Bevara bekräftade grenar och dokumenterade regler.
- Jämför grafik i ordinarie rendering; ange när testklockan accelereras.
- Högst två samtidiga GPU-browsers i denna miljö. Håll isär aktivt
  utvecklingsbygge och fryst produktionsbygge under verifiering.
- Lägg till meningsfulla regressioner och kör berörda kontroller efter fix.
- Checkpointa verifierade ändringar till samma branch/PR. Inga merge,
  publiceringar, större beroendeuppgraderingar eller destruktiva ingrepp.
- Bokför vad som faktiskt har gjorts och det som återstår. Ingen utfästelse
  om perfektion, oavbruten körning eller fysisk telefonprestanda utan evidens.

## Första passet — pågår

Start: 2026-11-05 23:38 UTC. Sex delgranskningar arbetar på åtskilda filer:

| Område | Ägare i första passet | Detaljerade arbetsanteckningar |
| --- | --- | --- |
| Gokart, triathlon | kart | `/workspace/pekkas-night/kart-triathlon.md` |
| Skytte, fäktning | triathlon | `/workspace/pekkas-night/shooting-fencing.md` |
| Bondespel, gårdskamp | farm_games | `/workspace/pekkas-night/farm-country.md` |
| Femkamp, parkmästare, pingis | field_games | `/workspace/pekkas-night/field-pingis.md` |
| Ambition, lera | ambition | `/workspace/pekkas-night/ambition-clay.md` |
| Fantasy, fiske, flipper | kart/tri_audit | `/workspace/pekkas-night/fantasy-fishing-pinball.md` |
| Gemensamt skal och Måleri | root | denna rapport |

Tidiga fynd är under reproduktion: tangentbordsägarskap och lokala dialoger,
rendering under paus, flera regler vid snabba samtidiga händelser, rättvis
projektilsimulering samt tids-/poänggränser. Inga av dessa ska räknas som
slutligt åtgärdade förrän fix och verifiering är dokumenterade nedan.

## Verifierade förbättringar

Fylls på efter varje integrerad och verifierad omgång.

## Fortsättning och begränsningar

Fortsatta pass ska läsa aktuell version av denna rapport, Git-status och
PR-branchen innan de arbetar. Lokal samordning finns i
`/workspace/pekkas-night/state.json` och `active.lock/owner.json`.
En aktiv lease betyder att en annan passägare skriver: arbeta då enbart
med oberoende läsgranskning och lämna fynd för integration.

Nattpass är schemalagda timvis 01:00–06:00 Europe/Stockholm denna natt;
morgonrapporten är schemalagd 07:00. Schemaläggningen bekräftades 23:44 UTC.
Detta är körplanen, inte ett påstående att framtida pass redan har körts.
Om arbetsmiljön byts och den lokala leasen saknas medan denna rapport
fortfarande säger att första passet pågår, gör enbart läsgranskning fram
till dess att en avslutad checkpoint finns. Ingen parallell skribent ska
gissa att en saknad lokal låsfil betyder att en pågående annan miljö är ledig.

Chromium och emulerade skärmstorlekar finns. Fysisk telefon, Safari/iOS och
verklig GPU-prestanda är ännu inte verifierade. Morgonrapporten ska skilja
slutförda ändringar från fynd, framtida förslag och ej utförda tester.
