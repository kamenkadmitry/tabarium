import { useState } from 'react';
import { Dialog, PrimaryButton, SecondaryButton } from '../Dialog';
import { LabelFields, type LabelsApi } from '../labels';
import { useT } from '../../i18n/I18nProvider';

interface Props {
  count: number;
  labels: LabelsApi;
  onSubmit: (labels: { tagIds: string[]; hashtagIds: string[] }) => Promise<void>;
  onClose: () => void;
}

/** Adds tags and hashtags to every selected link. Labels the links already have stay. */
export function BulkLabelsDialog({ count, labels, onSubmit, onClose }: Props) {
  const t = useT();
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [hashtagIds, setHashtagIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const nothing = tagIds.length === 0 && hashtagIds.length === 0;

  return (
    <Dialog title={t.plural('dlg.bulkLabels.title', count)} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSubmit({ tagIds, hashtagIds });
            onClose();
          } finally {
            setBusy(false);
          }
        }}
      >
        <LabelFields api={labels} tagIds={tagIds} hashtagIds={hashtagIds} onTags={setTagIds} onHashtags={setHashtagIds} />
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>{t('common.cancel')}</SecondaryButton>
          <PrimaryButton disabled={nothing || busy}>{t('dlg.bulkLabels.add', { n: count })}</PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
