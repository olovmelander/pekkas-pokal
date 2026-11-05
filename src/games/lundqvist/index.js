import { createCountryGames } from '../shared/country-events.js';
export const layout = 'full';
export default async function createLundqvist(container) {
  return createCountryGames(container, {
    id: 'lundqvist', year: 2016, title: 'Lundqvists Mångkamp', place: 'Idbyn', champion: 'Niklas Norberg',
    accent: '#a9d9b1', theme: 'lake',
    description: 'Lång sommarkväll vid vattnet. Läs vinden, hitta balansen och sätt det sista kastet.',
    events: [
      { kind: 'kubb', name: 'Kubbmästaren', verb: 'LADDA KAST', instructions: 'Sikta med ← → längs den prickade kastbågen. Håll KAST / mellanslag för kraft och släpp vid det ljusa fältet. Fäll de tre ljusa kubbarna före den gyllene kungen. Sex kast. Kungen för tidigt avslutar grenen.' },
      { kind: 'disc', name: 'Korgjakten', verb: 'LADDA KAST', instructions: 'Tre korgar, tre försök. Sikta med ← →, håll KAST / mellanslag och släpp. Vindflaggan visar sidvinden och kastbågen visar hur frisbeen böjer av. I korgen ger full poäng, nära ger tröstpoäng.' },
      { kind: 'log', name: 'Stockbalansen', verb: 'STADGA', instructions: 'Balansera över stocken med små tryck på ← →. Styr mot lutningen. Håll STADGA / mellanslag kort för att få kontroll, släpp för att gå vidare. Nå andra sidan inom 50 sekunder.' }
    ]
  });
}
