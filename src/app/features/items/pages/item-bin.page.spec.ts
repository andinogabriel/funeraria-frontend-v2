import { describeBinPage } from '../../../../testing/bin-page-spec';
import { item } from '../../../../testing/fixtures';
import { ItemBinPage } from './item-bin.page';

describeBinPage('ItemBinPage', {
  component: ItemBinPage,
  row: item({ deletedAt: '2026-11-02T10:00:00Z', deletedBy: 'admin@funeraria.local' }),
  expectText: 'COF-001',
  selectedSignal: 'selectedItem',
  textKeys: ['code', 'name', 'deletedBy'],
  autocompleteKeys: ['category', 'brand'],
  urlFilters: { code: 'COF', name: 'Cofre', deletedBy: 'admin' },
});
