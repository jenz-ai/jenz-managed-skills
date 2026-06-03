/**
 * Detector module: obfuscation & hidden-character smuggling.
 *
 * Catches base64/hex/escaped-byte concealment of executable intent, plus
 * homoglyph / mixed-script / zero-width / bidi tricks used to hide text from a
 * human reviewer. Owned by agent `prefilter-obfusc` — add rules + TDD here only.
 *
 * Finding types (must exist in `@jenz/shared` taxonomy):
 *   obfuscation · hidden-unicode
 */

import type { RegexRule } from './types';

export const OBFUSC_RULES: RegexRule[] = [];
