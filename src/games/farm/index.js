import { createFarmTournament } from './tournament.js';
export const layout = 'full';
export default async function createFarm(container) {
  return createFarmTournament(container);
}
