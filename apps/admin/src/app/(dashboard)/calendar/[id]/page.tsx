import { TaxDeadlineDetailPage } from './_components/TaxDeadlineDetailPage';

export default function Page({ params }: { params: { id: string } }): React.ReactNode {
  return <TaxDeadlineDetailPage id={params.id} />;
}
