import { createFieldGames } from '../shared/field-events.js';
import { PARTY_EVENTS } from './party.js';

export const layout = 'full';

export default async function createUppsala(container) {
  return createFieldGames(container, {
    id: 'uppsala', year: 2014, title: 'Pekkas Parkmästare', location: 'Uppsala',
    theme: 'park', accent: '#acd8c2', champion: 'Erik Vallgren',
    events: ['boule', 'croquet', 'rings', 'beerpong', 'flipcup'],
    custom: PARTY_EVENTS,
    // The flip cup teams need four a side.
    crew: ['Olov Melander', 'Rickard Nilsson', 'Tobias Lundqvist'],
    note: 'Beerpong och flipcup spelades i Uppsala 2014. Boule, krocket och ringkast är nygjorda för arkaden.'
  });
}
