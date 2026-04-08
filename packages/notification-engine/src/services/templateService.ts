import { MERGE_TAG_FALLBACKS } from '../types';

/**
 * Replace {{tag}} patterns with merge data values.
 * NTF-INV-04: Never send unresolved tags — use fallback values.
 */
export function renderMergeTags(
  template: string,
  mergeData: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, tag: string) => {
    if (tag in mergeData && mergeData[tag] !== undefined && mergeData[tag] !== '') {
      return mergeData[tag];
    }
    return MERGE_TAG_FALLBACKS[tag] ?? '';
  });
}
