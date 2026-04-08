import { OrderDetailPage } from './_components/OrderDetailPage';

export default function Page({ params }: { params: { id: string } }): React.ReactNode {
  return <OrderDetailPage id={params.id} />;
}
