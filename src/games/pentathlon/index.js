import { createFieldGames } from '../shared/field-events.js';

export const layout = 'full';

export default async function createPentathlon(container) {
  return createFieldGames(container, {
    id: 'pentathlon', year: 2013, title: 'Pekkas Femkamp', location: 'Kroksta',
    theme: 'meadow', accent: '#f4cb72', champion: 'Erik Vallgren',
    events: ['rings', 'hurdles', 'target', 'jump', 'balance']
  });
}
