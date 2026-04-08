import { ReputationDetailPage } from './_components/ReputationDetailPage';

export default function Page({ params }: { params: { id: string } }): React.ReactNode {
  return <ReputationDetailPage id={params.id} />;
}
