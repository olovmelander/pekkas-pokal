import { createCountryGames } from '../shared/country-events.js';
export const layout = 'full';
export default async function createLundqvist(container) {
  return createCountryGames(container, {
    id: 'lundqvist', year: 2016, title: 'Lundqvists Mångkamp', place: 'Idbyn', champion: 'Niklas Norberg',
    accent: '#a9d9b1', theme: 'lake',
    description: 'Lång sommarkväll vid vattnet. Läs vinden, hitta balansen och sätt det sista kastet.',
    events: [
      { kind: 'kubb', name: 'Kubbmästaren', verb: 'LADDA KAST', instructions: 'Sikta med ← →. Håll KAST / mellanslag för kraft och släpp. Fäll de tre ljusa kubbarna före den gyllene kungen. Sex kast. Kungen för tidigt avslutar grenen.' },
      { kind: 'disc', name: 'Korgjakten', verb: 'LADDA KAST', instructions: 'Tre korgar, tre försök. Sikta med ← →, håll KAST / mellanslag och släpp. Se vindpilen och sikta mot vinden. I korgen ger full poäng, nära ger tröstpoäng.' },
      { kind: 'log', name: 'Stockbalansen', verb: 'STADGA', instructions: 'Balansera över stocken med ← →. Styr mot lutningen. Håll STADGA / mellanslag för att stanna upp och få kontroll. Nå andra sidan utan att tappa balansen.' }
    ]
  });
}
