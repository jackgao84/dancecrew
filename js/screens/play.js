// #/play/<game>/<pid>[/<partnerId>] — runs one Arcade round inside the shared shell.
import * as State from '../state.js';
import { go } from '../ui.js';
import { gameById } from '../games/registry.js';
import { runRound } from '../games/shell.js';

export default function play(root, gameId, pid, partnerId) {
  const game = gameById(gameId);
  const player = State.player(pid);
  const partner = partnerId ? State.player(partnerId) : null;
  if (!game || !game.ready || !player || (game.kind === 'coop' && !partner)) { go(player ? '#/arcade/' + pid : '#/home'); return; }
  return runRound(root, { game, player, partner, kind: game.kind, onExit: () => go('#/arcade/' + pid) });
}
