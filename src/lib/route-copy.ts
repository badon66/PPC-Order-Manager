import type { RouteVariant } from '@/lib/types';

/**
 * How the customer's page opens, by the route they picked on the website.
 * Hand-made orders have no variant and keep the page's generic wording.
 */
export const ROUTE_COPY: Record<
  RouteVariant,
  { title: string; intro: string; logosHint: string; inspirationHint: string; rosterHint: string }
> = {
  ready: {
    title: 'Send us your design files',
    intro:
      "Logos, crest, any artwork you have — vector or the highest resolution you've got. Anything you'd like us to match goes under inspiration. Mockup back today.",
    logosHint: 'Vector (AI, EPS, SVG, PDF) is best. Otherwise the biggest PNG or JPG you have.',
    inspirationHint:
      "Optional. Anything you'd like the design to match — a photo of the old jerseys, a look you like.",
    rosterHint:
      'Only if you have it already. A spreadsheet or a photo of the list is fine, and so is "not yet".',
  },
  scratch: {
    title: 'Show us what you like',
    intro:
      'Any logo you already have goes first. Then pictures of looks you like — other jerseys, colour combos — and a line on what you like about each. We build the design from these.',
    logosHint: 'If you have one. A team crest, a sponsor logo, even a sketch. No logo yet is fine — skip this.',
    inspirationHint:
      'Pictures of looks you like — other jerseys, colour combos, anything. Tell us what you like about each one.',
    rosterHint:
      'Only if you have it already. A spreadsheet or a photo of the list is fine, and so is "not yet".',
  },
  reorder: {
    title: 'Same design, new season',
    intro:
      "Tell us who's getting what — names as printed, numbers, sizes — and check the shipping details. Leave anything you don't know yet; you can come back to this link.",
    logosHint: 'Only if something changed — a new sponsor, a new crest.',
    inspirationHint: 'Only if you want the look changed.',
    rosterHint:
      'Names exactly as they should be printed on the jersey. Type them in, or upload the list you already have.',
  },
};
