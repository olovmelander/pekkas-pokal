# Pekkas Gokart — research och design

## Historisk utgångspunkt

`competition-data.csv` anger Gokart i Varggropen, 28 juli 2012. Jonas Eriksson vann,
Erik Vallgren blev tvåa och Viktor Jones trea. Spelet låter spelaren utmana dem
samt Per Vikman och Rickard Nilsson. Banan är en konstnärlig tolkning, inte en
uppmätt rekonstruktion av den verkliga banan.

## Källor, lästa 5 november 2026

- [TeamSport: Understanding the racing line](https://www.team-sport.co.uk/go-karting-faqs/understanding-the-racing-line)
  beskriver bromspunkt, sväng, apex och utgång. Speldesign: bromsa före svängen,
  välj innerkant och accelerera ut på raksträckan.
- [TeamSport: Advanced karting techniques](https://www.team-sport.co.uk/go-karting-faqs/go-karting-tips-advanced-karting-techniques)
  betonar bromsning före kurvan. I spelet gör för hög ingångsfart att däcken tappar
  grepp och karten glider utåt. En lugnare ingång ger bättre kontroll.
- [TeamSport: How to overtake](https://www.team-sport.co.uk/go-karting-faqs/how-to-overtake)
  beskriver utgångsfart, omkörningslinjer och minskat luftmotstånd bakom en rival.
  Spelet har en liten slipstreamfördel när en annan kart är framför på samma linje.
- [Daytona Motorsport: Karting tips and advice](https://daytona.co.uk/news/karting-tips-and-advice/)
  tar upp att lämna slipstreamen och välja innerlinjen inför nästa kurva. Det är
  en omkörningsteknik som spelaren kan prova utan separata specialknappar.

## Genomförande

Ett banlopp med gas, broms, däckgrepp och tre varv. Fem rivaler bromsar inför
kurvorna och väljer racinglinjer. Spelarens beslut är ingångsfart, linjeval och
läge för omkörning. Gräs, för snabba kurvor och sammanstötningar kostar tid.
Luftmotståndet minskar lite bakom en annan kart; effekten finns bara så länge
spelaren ligger i suget. Det finns inga vapen eller särskilda fartkrafter.

På telefon används två styrknappar och GAS/BROMS. På dator styr A/D eller
vänster/höger, W/upp gasar och S/ned/mellanslag bromsar. Pedaler kan hållas före
startsignalen. Styrhjälpen följer banans huvudsakliga riktning, medan spelaren
väljer linjen. Detta är en lättillgänglig körmodell, inte en exakt kart-simulator.

Den procedurgenererade 3D-miljön har kvällssol, skog, röda/vita kantstenar,
klubbhus, depåtält, publik, vimplar och en guldkart. Kameran följer färdriktningen
och flyttar upp/bak i stående format. Minikartan visar bana och deltagare.
Greppmätaren och en varning inför snäva kurvor hjälper spelaren att lära banan.
Instanser och gemensamma material håller nere antalet renderingsanrop.

Resultatet visar placering, totaltid, snabbaste varv och poäng för tid, placering
samt ren körning. Personbästa sparas lokalt. Kontroller återställs vid
pointercancel, förlorad pointer capture, paus och blur. Den gemensamma
spelmotorn äger paus, ljud, storleksändring och avmontering.
