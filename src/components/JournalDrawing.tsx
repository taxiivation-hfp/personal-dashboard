import Sheet from "./Sheet";
import { SHEET_RATIO } from "@/lib/sheets";

/**
 * A HANDWRITTEN PAGE, READ WHOLE — every sheet of the scroll, stacked.
 *
 * A drawing is a scroll of A4 sheets since 2026-08-25 (see sheets.ts): sheet 0 where the
 * page always lived, sheets 1.. in `journal_sheets`, one PNG each. A reader that drew only
 * `[id]/image` would show a page cut off at the eighteenth line and call it the page. This
 * is the one component that knows a page is several images, so the reader and the record's
 * spread cannot disagree about how a scroll is drawn — and the thumbnails deliberately do
 * NOT use it: a thumbnail is the top of the page (`/image`, `object-top`), which is what a
 * page looks like on a shelf.
 *
 * NO GAP, NO BORDER BETWEEN SHEETS. On screen the page is one continuous ruled scroll; the
 * split into sheets is a fact about request bodies and canvas limits, not about paper, and
 * the reader must not draw a seam the writer never saw. The border and radius belong to the
 * OUTER sheet, which the caller dresses through `className` exactly as it dressed the
 * single image before.
 *
 * `rev` is a cache-buster. Every sheet route is served `private, max-age=3600`, right for a
 * page that almost never changes and wrong for the one that just did; the reader bumps it
 * after a save so the browser fetches the ink rather than answering from its cache.
 */
export default function JournalDrawing({
  id,
  sheets,
  rev,
  alt,
  className = "",
}: {
  id: number;
  /** Total sheets, sheet 0 included. Anything below one is drawn as one — a page always
   *  has its first sheet, whatever a count that was never asked for says. */
  sheets: number;
  rev?: number;
  alt: string;
  className?: string;
}) {
  const count = Number.isFinite(sheets) && sheets > 1 ? Math.floor(sheets) : 1;
  const v = rev != null ? `?v=${rev}` : "";

  return (
    // No rules: each PNG carries its own, and a layer underneath would show a second set
    // through the paper. Not A4: the scroll is as long as its sheets, and a fixed extent
    // would clip every sheet after the first — the exact failure this component replaces.
    <Sheet rules={false} a4={false} className={className}>
      {Array.from({ length: count }, (_, seq) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={seq}
          src={`/api/journal/${id}/sheet/${seq}${v}`}
          // One description for the page, not one per sheet — a screen reader leafing
          // through "sheet 1 of 3, sheet 2 of 3" is being told about request bodies.
          alt={seq === 0 ? alt : ""}
          // `auto 1 / ratio`: the image's own ratio once it has loaded — a sheet saved
          // before the A4 rule is whatever shape the dialog was, and is shown at that
          // shape rather than squashed — and A4 while it is still on its way, so the
          // scroll stands at its height from the first paint instead of unfolding sheet
          // by sheet as each arrives.
          style={{ aspectRatio: `auto 1 / ${SHEET_RATIO}` }}
          className="block h-auto w-full"
        />
      ))}
    </Sheet>
  );
}
