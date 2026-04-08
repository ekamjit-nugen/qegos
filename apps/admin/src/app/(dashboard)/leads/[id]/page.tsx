import { LeadDetailPage } from './_components/LeadDetailPage';

export default function Page({ params }: { params: { id: string } }): React.ReactNode {
  return <LeadDetailPage id={params.id} />;
}
