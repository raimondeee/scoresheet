import { EVENT_TONE_LABEL, eventTone, eventTonesPresent, type EventTone } from '../hockey.ts';
import type { EventType } from '../types.ts';

export type EventFilterValue = 'all' | EventTone;

export function EventFilter({
  events,
  value,
  onChange,
}: {
  events: Array<{ type: EventType; meta?: { result?: string } }>;
  value: EventFilterValue;
  onChange: (value: EventFilterValue) => void;
}) {
  const tones = eventTonesPresent(events);
  if (tones.length < 2) return null;
  return (
    <div className="event-filters" role="group" aria-label="Filter events">
      <button type="button" className={value === 'all' ? 'on' : ''} onClick={() => onChange('all')}>
        All
      </button>
      {tones.map((tone) => (
        <button
          key={tone}
          type="button"
          className={`tone-${tone}${value === tone ? ' on' : ''}`}
          onClick={() => onChange(tone)}
        >
          {EVENT_TONE_LABEL[tone]}
        </button>
      ))}
    </div>
  );
}

export function matchesEventFilter(
  event: { type: EventType; meta?: { result?: string } },
  value: EventFilterValue,
) {
  return value === 'all' || eventTone(event) === value;
}
