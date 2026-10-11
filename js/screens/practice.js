// Practice Session (#/practice/<pid>): the v1 daily reward, now a round of Beat Battle in the
// round shell. Free once a day after 3 real-life points; the round gate handles carry-over and
// wind-down, and practice never uses a ticket.
import * as State from '../state.js';
import { go } from '../ui.js';
import beat from '../games/beat.js';
import { runRound } from '../games/shell.js';

export default function practice(root, pid) {
  const p = State.player(pid);
  if (!p) { go('#/home'); return; }
  const exit = () => {
    const q = State.player(pid);
    go(q && State.today(q).resting ? '#/rest/' + pid : '#/player/' + pid);
  };
  return runRound(root, {
    game: beat, player: p, kind: 'practice', onExit: exit,
    introLine: 'Practice time! Tap, hold and flick to the beat.',
  });
}
