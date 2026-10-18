import { useRef, type ReactNode } from 'react';

type Item<T extends string> = { value: T; label: ReactNode; panelId: string; id: string };
export default function StudyTabs<T extends string>({ items, value, onChange, label, className = '' }: {
  items: Item<T>[]; value: T; onChange: (value: T) => void; label: string; className?: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return <div role="tablist" aria-label={label} className={`tool-tabs ${className}`}>
    {items.map((item, index) => <button
      key={item.value} ref={element => { buttons.current[index] = element; }}
      type="button" role="tab" id={item.id} aria-controls={item.panelId}
      aria-selected={value === item.value} tabIndex={value === item.value ? 0 : -1}
      onClick={() => onChange(item.value)}
      onKeyDown={event => {
        let next: number;
        if (event.key === 'ArrowRight') next = (index + 1) % items.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = items.length - 1;
        else return;
        event.preventDefault(); onChange(items[next].value); buttons.current[next]?.focus();
      }}
    >{item.label}</button>)}
  </div>;
}
