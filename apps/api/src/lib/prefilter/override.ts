/**
 * Detector module: instruction-override & tool-poisoning phrasing.
 *
 * Catches prompt-injection text that tries to override the downstream agent's
 * prior instructions, change its trust boundaries, or poison its tool/skill
 * behaviour. Owned by agent `prefilter-override` — add rules + TDD here only.
 *
 * Finding types (must exist in `@jenz/shared` taxonomy):
 *   instruction-override · social-engineering · excessive-agency · description-mismatch
 */

import type { RegexRule } from './types';

export const OVERRIDE_RULES: RegexRule[] = [];
