import PromoCodeDetailPage from './_components/PromoCodeDetailPage';

export default function PromoCodeDetail({ params }: { params: { id: string } }): React.ReactNode {
  return <PromoCodeDetailPage id={params.id} />;
}
