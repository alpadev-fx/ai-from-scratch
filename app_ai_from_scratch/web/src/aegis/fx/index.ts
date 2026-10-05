// Stage-2B chapter effects (the AEGIS motion of the Hormozi chapters). main.ts calls initFx() in the very task that switches html.fxl on, so everything that
// hangs on the tall layout and every pre-state is set before the first frame of it is painted. Each effect is built apart: one that cannot be built (a hook
// missing from the markup, anything that throws) is undone and says so in the console, and its chapter stays the static one; the others and the engine go on.
import { effect, REG, type Fx } from './common';
import { initC02 } from './c02';
import { initC03 } from './c03';
import { initC05 } from './c05';
import { initC05V } from './c05v';
import { initC06 } from './c06';
import { initC07 } from './c07';
import { initC08 } from './c08';
import { initC09 } from './c09';
import { initC12V } from './c12v';
import { initC13 } from './c13';
import { initC14 } from './c14';
import { initWordmark } from './wordmark';

const CHAPTERS: Array<[string, () => Fx]> = [['c02', initC02], ['c03', initC03], ['c05', initC05], ['c05v', initC05V], ['c06', initC06], ['c07', initC07], ['c08', initC08], ['c09', initC09], ['c12v', initC12V], ['c13', initC13], ['c14', initC14], ['wordmark', initWordmark]];

export function initFx(): Fx {
  const live: Fx[] = [];
  for (const [id, init] of CHAPTERS) {
    try { live.push(init()); } catch (e) { console.warn(`[v3] the effect of #${id} is off (the chapter stays static):`, e); }
  }
  const all = effect((undo) => { undo(() => { live.splice(0).reverse().forEach((f) => f.dispose()); }); });
  REG.dispose = () => all.dispose();                                 // review hook: the harnesses prove that disposing gives back exactly the static chapters
  return all;
}
