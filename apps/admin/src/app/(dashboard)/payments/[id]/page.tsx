import { PaymentDetailPage } from './_components/PaymentDetailPage';

export default function Page({ params }: { params: { id: string } }): React.ReactNode {
  return <PaymentDetailPage id={params.id} />;
}
