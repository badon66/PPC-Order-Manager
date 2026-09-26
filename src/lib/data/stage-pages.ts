import type { ClientLinkSections } from '@/lib/types';

/**
 * The two customer-facing stage pages: design (logos + inspiration) and
 * details (roster + personal details). Split by section so a customer asked
 * for their roster isn't also shown a logo upload they already handled.
 *
 * Pure and store-agnostic — the same helper builds the link both the
 * timeline (a relative path under the customer's own token) and the stage
 * emails (which prefix a base URL) point at.
 */

export type StagePage = 'design' | 'details';

export const STAGE_SECTIONS: Record<StagePage, ClientLinkSections> = {
  design: { logos: true, inspiration: true, roster: false, personalDetails: false },
  details: { logos: false, inspiration: false, roster: true, personalDetails: true },
};

export const STAGE_PAGE_COPY: Record<StagePage, { title: string; intro: string }> = {
  design: {
    title: 'Send us your logos and inspiration',
    intro: "Your logo in any format, your colours, and pictures of looks you like. No logo yet is fine — tell us the idea and we'll draw it.",
  },
  details: {
    title: 'Roster and contact details',
    intro: "Each player's name as it should print, their number, and jersey and sock sizes, plus who we contact and where the box ships.",
  },
};

/** Relative paths, so the same helper serves pages and emails (emails prefix the base URL). */
export function stagePagePaths(token: string): Record<StagePage, string> {
  return {
    design: `/roster/${token}/design`,
    details: `/roster/${token}/details`,
  };
}
