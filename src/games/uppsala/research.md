# Pekkas Parkmästare, 2014

Research, historisk avgränsning, primärkällor, grafik och designbeslut finns i
[Femkamp och Parkmästare: research och design](../pentathlon/research.md).

Spelet har fem grenar i en stiliserad Uppsalapark: boule, krocket, ringkast,
beerpong och flipcup. **Beerpong och flipcup spelades i Uppsala 2014**, enligt
repositoriets ägare (uppgift 6 november 2026). Boule, krocket och ringkast är
nygjorda för arkaden och påstås inte ha ingått; CSV-filen belägger bara
tävlingsnamnet, orten och resultaten.

## Beerpong och flipcup

Reglerna är förenklade till korta arkadgrenar, inte en fullständig match.

**Beerpong:** sex muggar i en triangel med spetsen mot kastaren och tio bollar.
Pilarna siktar och kraftmätaren avgör längden; en ljus ring visar var bollen
kommer ner. Bollen går i om dess mitt hamnar inom 6 cm från muggens mitt; utanför
det, men inom kanten, studsar den på kanten och räknas inte. Studsskott, re-rack
och "bollarna tillbaka" finns inte. Hela bordet ger 85 poäng och varje boll som
blir över fem till, högst 100. Muggarna är ungefär 1,45 gånger en vanlig
festmugg så att triangeln syns på en telefon. Bordet har en sköljmugg, som
brukligt. Erik Vallgren står bakom muggarna och tar hand om dem som träffas.

**Flipcup:** en stafett fyra mot fyra, Hägglund, Vikman, Jones och Melander mot
Vallgren, Lundqvist, Nilsson och Tobias Lundqvist. Spelaren styr hela sitt lag:
håll för att dricka ur muggen, som sedan ställs med kanten utanför bordskanten,
håll och släpp sedan kraftmätaren i det gröna fältet. För löst och muggen faller
tillbaka, för hårt och den rullar iväg och måste ställas upp igen. Varje mugg
står lite olika, så fältet flyttar sig. Motståndarlaget kör samma moment med
slumpade tider och missar (ungefär två av tre flippar sitter), i snitt runt
13,5 sekunder; ett felfritt lopp tar cirka 12. Tiden ger upp till 90 poäng och
vinst mot Vallgrens lag tio till.

`tests/party.test.js` kontrollerar att varje mugg kan träffas med det sikte och
den kraft spelet visar, att tidsfönstret är rimligt, kant- och missbedömningar,
poängen, flipcupfönstren och att motståndarlaget går att slå med ett rent lopp
men inte med ett slarvigt.

## Grafik

Det senare grafikpasset ger Uppsala ett eget formellt trädgårdsuttryck:
orangeri med glas, spröjs, odlingsbord och terrakottakrukor; fontän med
vattenstrålar; tegelrelief, rundfönster och valvfönster i stadssilhuetten.
Perenner, stenkanter och en träpergola ramar in spelplanen. Naturen använder
Måleriets etablerade förgrenade vegetation och vindshader. Detaljerna är
scenografi för en fri arkadtolkning och påstår inte att platsen såg ut så 2014.
