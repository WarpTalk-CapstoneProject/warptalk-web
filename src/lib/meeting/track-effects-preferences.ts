/**
 * Bumped whenever the DEFAULT changes, so a stored answer to the old question stops being read as
 * an answer to the new one.
 *
 * 4: noise suppression is now ON unless the participant turned it off. Everybody carrying a
 * version-3 preference — including the many `false` values that were never a choice, just the old
 * default written down — falls through to the new default and gets it. Somebody who opts out at
 * version 4 has their `false` honoured, because at this version false IS a choice.
 */
export const NOISE_SUPPRESSION_PREFERENCE_VERSION = 4;
