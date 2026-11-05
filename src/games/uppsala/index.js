import { createFieldGames } from '../shared/field-events.js';

export const layout = 'full';

export default async function createUppsala(container) {
  return createFieldGames(container, {
    id: 'uppsala', year: 2014, title: 'Pekkas Parkmästare', location: 'Uppsala',
    theme: 'park', accent: '#acd8c2', champion: 'Erik Vallgren',
    events: ['boule', 'croquet', 'rings']
  });
}
