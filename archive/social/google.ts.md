# CalEvent.recurring

Parked verbatim from `src/lib/google.ts` at commit `c86f000` by the owner's ruling of 2026-09-18 (see README.md).
Each block below is an exact slice of that file; the heading gives its original line range.

## `src/lib/google.ts:90-105` — the recurring field and its reason

```ts
  /**
   * Is this event an instance of a REPEATING series?
   *
   * `recurringEventId` is present on every instance Google expands out of a series and
   * absent on a one-off, so this is the API stating the fact directly rather than the app
   * inferring it. Like `colorId` it costs nothing to ask for — neither request sends a
   * `fields=` mask, so it has always been in the response and was simply being dropped.
   *
   * It exists because the Social ring needs to tell a standing commitment (Church, a weekly
   * night out) from a one-off (a farewell, a lunch), and COLOUR CANNOT CARRY THAT. The
   * calendar UI's palette is wider than the eleven legacy ids this API reports, so Graphite
   * and Birch both arrive as colorId 8 — measured over 180 days of the owner's calendar,
   * where id 8 held Church and Nathan's Farewell side by side. Recurrence was what the two
   * colours were standing in for all along; this reads it off the source instead.
   */
  recurring: boolean;
```

## `src/lib/google.ts:304-309` — listEvents mapping

```ts
      allDay: Boolean(start?.date && !start?.dateTime),
      colorId: e.colorId == null ? null : String(e.colorId),
      // Present only on an instance of a repeating series — see the CalEvent field.
      recurring: e.recurringEventId != null,
    };
  });
```

## `src/lib/google.ts:421-425` — listEventsRange mapping

```ts
      allDay: Boolean(start?.date && !start?.dateTime),
      colorId: e.colorId == null ? null : String(e.colorId),
      // Present only on an instance of a repeating series — see the CalEvent field.
      recurring: e.recurringEventId != null,
    };
```
