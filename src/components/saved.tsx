import { createContext, useContext } from 'react';
import type { CustomAbility, Move } from '../engine/types';

/** The player's saved custom moves and abilities, shared with every editor. */
export interface SavedStuff {
  moves: Move[];
  abilities: CustomAbility[];
  /** Saves a move, replacing a saved move with the same name. */
  saveMove: (m: Move) => void;
  /** Saves an ability, replacing a saved ability with the same name. */
  saveAbility: (a: CustomAbility) => void;
}

export const SavedContext = createContext<SavedStuff>({
  moves: [], abilities: [], saveMove: () => {}, saveAbility: () => {},
});

export const useSaved = () => useContext(SavedContext);

/** JSON with sorted keys, so objects compare equal regardless of property order. */
export function canon(v: unknown): string {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${k}:${canon(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
