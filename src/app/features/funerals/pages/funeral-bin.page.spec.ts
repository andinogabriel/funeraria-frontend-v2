import { describeBinPage } from '../../../../testing/bin-page-spec';
import { funeral } from '../../../../testing/fixtures';
import { FuneralBinPage } from './funeral-bin.page';

describeBinPage('FuneralBinPage', {
  component: FuneralBinPage,
  row: funeral({ deletedAt: '2026-11-02T10:00:00Z', deletedBy: 'admin@funeraria.local' }),
  expectText: 'F-1001',
  selectedSignal: 'selectedFuneral',
  textKeys: ['deceasedName', 'dni', 'receiptNumber', 'deletedBy'],
  urlFilters: { deceasedName: 'Juan', deletedBy: 'admin' },
});
