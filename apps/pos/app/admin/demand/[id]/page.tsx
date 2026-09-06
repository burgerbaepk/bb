import { notFound } from 'next/navigation';
import { DemandSheetEditor } from '@/components/admin/DemandSheetEditor';
import { requirePermissionPage } from '@/lib/auth/session';
import { readDemandCatalogue, readDemandSheet } from '@/lib/demand/queries';
import { can } from '@natech/contracts';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requirePermissionPage('reports.read');
  const { id } = await params;
  const [sheet, catalogue] = await Promise.all([readDemandSheet(id), readDemandCatalogue()]);
  if (sheet === null) notFound();
  return (
    <DemandSheetEditor
      sheet={sheet}
      catalogue={catalogue}
      canWrite={can(viewer, 'expenses.write')}
    />
  );
}
