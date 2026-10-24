import type { CardDetails } from '../../core/ai/tasks';
import type { Card } from '../../core/types';
import { Dialog } from '../Dialog';
import type { LabelsApi } from '../labels';
import { LinkEditor } from '../LinkEditor';
import { type LinkValues } from '../linkInput';
import { useT } from '../../i18n/I18nProvider';

interface Props {
  card: Card;
  labels: LabelsApi;
  suggest?: (input: { title: string; url: string }) => Promise<CardDetails>;
  onSubmit: (values: LinkValues) => Promise<boolean>;
  onClose: () => void;
}

/** The link editor in a modal, for lists that have no board to open it in (Starred, Duplicates, search). */
export function CardDialog({ card, labels, suggest, onSubmit, onClose }: Props) {
  const t = useT();
  return (
    <Dialog title={t('dlg.editCard.title')} onClose={onClose}>
      <LinkEditor
        mode="edit"
        layout="stack"
        labels={labels}
        suggest={suggest}
        initial={{ title: card.customTitle ?? card.title, url: card.url, note: card.note ?? '', tagIds: card.tagIds, hashtagIds: card.hashtagIds }}
        onSubmit={async (values) => {
          const ok = await onSubmit(values);
          if (ok) onClose();
          return ok;
        }}
        onCancel={onClose}
      />
    </Dialog>
  );
}
