import { Field, Section } from '@/components/ui';
import type { WebsiteEnquiry } from '@/lib/types';

/**
 * What the team wrote on the website, word for word. Internal only — this
 * never goes near the share page. Empty fields are skipped, so the card is
 * as long as what they said and no longer.
 */
export function EnquiryCard({ enquiry }: { enquiry: WebsiteEnquiry }) {
  const rows: Array<[string, string]> = [
    ['Starting point', enquiry.startingPoint],
    ['How many', enquiry.quantity],
    ['Needed by', enquiry.timeline],
    ['League / level', enquiry.league],
    ['Jersey style', enquiry.jerseyStyle],
    ['Ordering', enquiry.items.join(', ')],
    ['Artwork', enquiry.artworkStatus],
    ['Team colours', enquiry.colours],
    ['Inspiration', enquiry.inspiration],
    ['Previous order', enquiry.previousOrder],
    ['Anything else', enquiry.extraDetails],
  ];
  const received = new Date(enquiry.receivedAt).toLocaleString('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (
    <Section title="Website enquiry">
      <div className="grid gap-3 sm:grid-cols-2">
        {rows
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <Field key={label} label={label}>
              {value}
            </Field>
          ))}
        <Field label="Received">{received}</Field>
      </div>
    </Section>
  );
}
