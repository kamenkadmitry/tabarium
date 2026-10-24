import { X } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { useT } from '../i18n/I18nProvider';
import type { OpenTab } from '../platform/ports';
import { hostOf, PageFavicon } from './CardRow';

interface Props {
  tab: OpenTab;
  /** When defined, the pill can be selected: the icon turns into a checkbox on hover and while selected. */
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Click on the title, e.g. to switch to the tab. */
  onActivate?: () => void;
  onClose?: () => void;
  /** "roomy" is the larger two-line chip used in the side panel and popup. */
  size?: 'compact' | 'roomy';
  /** Draws the drop-position bar above the row while something is dragged over it. */
  dropAbove?: boolean;
  /** Extra props for the <li>, e.g. drag handlers. */
  itemProps?: HTMLAttributes<HTMLLIElement>;
}

/**
 * A browser tab as a rounded chip: the site's icon and the page title. The focused tab of a window is
 * highlighted, hovering reveals a selection checkbox (in place of the icon) and a close button.
 */
export function TabPill({ tab, selected, onToggleSelect, onActivate, onClose, size = 'compact', itemProps, dropAbove }: Props) {
  const t = useT();
  const roomy = size === 'roomy';
  const selectable = selected !== undefined && onToggleSelect !== undefined;
  const title = tab.title || tab.url;
  return (
    <li
      {...itemProps}
      data-open-tab-id={tab.id}
      aria-current={tab.active ? 'true' : undefined}
      className={`group flex items-center gap-3 rounded-xl border font-medium transition-colors duration-150 ${
        dropAbove ? 'relative before:absolute before:-top-px before:inset-x-1 before:h-0.5 before:rounded before:bg-primary ' : ''
      }${
        roomy ? 'min-h-12 px-3 py-1.5 text-sm' : 'h-9 gap-2 px-2.5 text-xs'
      } ${
        selected ? 'border-primary bg-surface-2' : tab.active ? 'border-line bg-surface-2' : 'border-transparent bg-bg hover:bg-surface-2'
      }`}
    >
      <span className="relative grid size-5 shrink-0 place-items-center">
        <span className={selectable ? (selected ? 'opacity-0' : 'transition-opacity duration-100 group-hover:opacity-0') : ''}>
          <PageFavicon url={tab.url} favIconUrl={tab.favIconUrl} size={roomy ? 20 : 16} />
        </span>
        {selectable && (
          <input
            type="checkbox"
            aria-label={t('pill.select', { title })}
            checked={selected}
            onChange={onToggleSelect}
            className={`absolute inset-0 m-auto size-4 cursor-pointer accent-[var(--primary)] transition-opacity duration-100 ${
              selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
            }`}
          />
        )}
      </span>
      {onActivate ? (
        <button type="button" title={`${title}\n${tab.url}`} onClick={onActivate} className={`min-w-0 flex-1 text-left ${roomy ? '' : 'py-1.5'} ${tab.active ? 'font-bold' : ''}`}>
          <span className="block truncate">{title}</span>
          {roomy && <span className="block truncate text-xs font-normal text-muted">{hostOf(tab.url)}</span>}
        </button>
      ) : (
        <span title={`${title}\n${tab.url}`} className={`min-w-0 flex-1 ${tab.active ? 'font-bold' : ''}`}>
          <span className="block truncate">{title}</span>
          {roomy && <span className="block truncate text-xs font-normal text-muted">{hostOf(tab.url)}</span>}
        </span>
      )}
      {onClose && (
        <button
          type="button"
          aria-label={t('pill.close', { title })}
          onClick={onClose}
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted opacity-0 transition-opacity duration-150 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
        >
          <X size={13} aria-hidden />
        </button>
      )}
    </li>
  );
}
