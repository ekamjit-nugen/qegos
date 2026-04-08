import { BillingDisputeDetailPage } from './_components/BillingDisputeDetailPage';

export default function Page({ params }: { params: { id: string } }): React.ReactNode {
  return <BillingDisputeDetailPage id={params.id} />;
}
