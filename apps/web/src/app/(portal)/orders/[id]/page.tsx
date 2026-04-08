'use client';

import { useParams } from 'next/navigation';
import { OrderDetailPage } from './_components/OrderDetailPage';

export default function OrderDetailRoute(): React.ReactNode {
  const params = useParams<{ id: string }>();
  return <OrderDetailPage id={params.id} />;
}
