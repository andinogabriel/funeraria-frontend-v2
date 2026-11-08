import { describeBinPage } from '../../../../testing/bin-page-spec';
import { affiliate } from '../../../../testing/fixtures';
import { AffiliateBinPage } from './affiliate-bin.page';

describeBinPage('AffiliateBinPage', {
  component: AffiliateBinPage,
  row: affiliate({ deletedAt: '2026-11-02T10:00:00Z', deletedBy: 'admin@funeraria.local' }),
  expectText: 'Gomez',
  selectedSignal: 'selectedAffiliate',
  textKeys: ['firstName', 'lastName', 'dni', 'deletedBy'],
  urlFilters: { firstName: 'Ana', deletedBy: 'admin' },
});
