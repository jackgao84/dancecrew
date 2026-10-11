// All Arcade games, in the order they appear. A game shows up only when its module sets
// `ready: true` — so a partly built v2 never shows a placeholder to the kids.
import beat from './beat.js';
import dash from './dash.js';
import spark from './spark.js';
import showdown from './showdown.js';
import combo from './combo.js';

export const GAMES = [beat, dash, spark, showdown, combo];
export const gameById = id => GAMES.find(g => g.id === id) || null;
export const readyGames = () => GAMES.filter(g => g.ready);
