import type { CSSProperties, ReactNode } from "react";

/**
 * THE PAGE. One sheet of ruled A4, at whatever size it is asked for.
 *
 * A journal page is written in one place, shelved in a second and read in a third, and
 * before this it was drawn three different ways — a canvas that baked its own 34px ruling
 * into a PNG, a textarea that repeated the number in CSS, and a thumbnail that had no
 * paper at all and simply printed the words on a blank card. Three descriptions of one
 * artefact is how a journal ends up looking like two features.
 *
 * The ruling lives in `.sheet` in globals.css and is derived from the sheet's own WIDTH,
 * so this component takes no size of its own: give it a width and it is a page at that
 * width, ruled into the same eighteen lines as every other.
 */
export default function Sheet({
  /** Fixed A4 extent — the writing surface and the shelf. Off for the reader, whose page
   *  is at least A4 and then as long as the writing on it. */
  a4 = true,
  /** Off behind a drawing: a handwritten page has its rules baked into the PNG, and a
   *  second set underneath would be a second set showing through the paper. */
  rules = true,
  className = "",
  style,
  children,
}: {
  a4?: boolean;
  rules?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div
      className={`sheet ${a4 ? "sheet-a4" : ""} ${className}`}
      style={style}
    >
      {rules && <div className="sheet-rules" aria-hidden />}
      {children}
    </div>
  );
}
