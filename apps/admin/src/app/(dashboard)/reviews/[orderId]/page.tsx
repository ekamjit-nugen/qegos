import { ReviewDetailPage } from './_components/ReviewDetailPage';

export default function Page({ params }: { params: { orderId: string } }): React.ReactNode {
  return <ReviewDetailPage orderId={params.orderId} />;
}
