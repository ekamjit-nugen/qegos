import { ReferralDetailPage } from './_components/ReferralDetailPage';

export default function Page({ params }: { params: { id: string } }): React.ReactNode {
  return <ReferralDetailPage id={params.id} />;
}
