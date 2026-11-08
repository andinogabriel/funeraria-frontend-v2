import { describeBinPage } from '../../../../testing/bin-page-spec';
import { plan } from '../../../../testing/fixtures';
import { PlanBinPage } from './plan-bin.page';

describeBinPage('PlanBinPage', {
  component: PlanBinPage,
  row: plan({ deletedAt: '2026-11-02T10:00:00Z', deletedBy: 'admin@funeraria.local' }),
  expectText: 'Plan Standard',
  selectedSignal: 'selectedPlan',
  textKeys: ['name', 'deletedBy'],
  urlFilters: { name: 'Plan', deletedBy: 'admin' },
});
