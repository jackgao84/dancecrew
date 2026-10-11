// Personal progress for one player in one game: best, last 7 rounds, "Most improved".
// Never compares players.
import { esc, icon } from '../ui.js';

/** Tiny bar chart of the last 7 rounds (oldest → newest). The newest bar is highlighted. */
export function sparkline(scores, { best = 0, label = 'Your last rounds' } = {}) {
  const s = scores.slice(-7);
  const max = Math.max(1, best, ...s);
  const slots = Array.from({ length: 7 }, (_, i) => s[i - (7 - s.length)]);
  const bars = slots.map((v, i) => {
    if (v == null) return `<rect x="${i * 16 + 2}" y="34" width="12" height="4" rx="2" class="sp-empty"/>`;
    const h = Math.max(4, Math.round((v / max) * 34));
    const last = i === 6;
    return `<rect x="${i * 16 + 2}" y="${38 - h}" width="12" height="${h}" rx="3" class="${last ? 'sp-last' : v === best ? 'sp-best' : 'sp-bar'}"/>`;
  }).join('');
  return `<svg class="sparkline" viewBox="0 0 114 40" role="img" aria-label="${esc(label)}: ${s.join(', ') || 'no rounds yet'}">${bars}</svg>`;
}

export function improvedBadge(count) {
  return count ? `<span class="tag improved">${icon('sparkle')} Most improved${count > 1 ? ' ×' + count : ''}</span>` : '';
}
