import React from 'react';
import { PackageCheck } from 'lucide-react';

// Most glyphs are text; "Completed" is an icon so it cannot be mistaken for the
// green approve tick on pending DOs.
const ICONS = { done: PackageCheck };

/** A block state's marker: its lucide icon where it has one, else its text glyph. */
export default function BlockGlyph({ state, glyph, className = 'h-3 w-3' }) {
  const Icon = ICONS[state];
  return Icon ? <Icon className={`inline-block ${className}`} aria-hidden="true" /> : <>{glyph}</>;
}
