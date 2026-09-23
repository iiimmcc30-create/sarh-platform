import { createIconSet } from '@expo/vector-icons';
import {
  FLATICON_FONT_FAMILIES,
  FLATICON_FONT_FILES,
  FLATICON_GLYPH_MAPS,
  type FlaticonStyle,
} from '@/constants/flaticon-glyphs';

export const flaticonIconSets = {
  rr: createIconSet(
    FLATICON_GLYPH_MAPS.rr,
    FLATICON_FONT_FAMILIES.rr,
    FLATICON_FONT_FILES.rr,
  ),
  sr: createIconSet(
    FLATICON_GLYPH_MAPS.sr,
    FLATICON_FONT_FAMILIES.sr,
    FLATICON_FONT_FILES.sr,
  ),
  br: createIconSet(
    FLATICON_GLYPH_MAPS.br,
    FLATICON_FONT_FAMILIES.br,
    FLATICON_FONT_FILES.br,
  ),
} as const;

export function getFlaticonIconSet(style: FlaticonStyle = 'rr') {
  return flaticonIconSets[style];
}
