import { BroadcastDetailPage } from './_components/BroadcastDetailPage';

export default function Page({ params }: { params: { id: string } }): React.ReactNode {
  return <BroadcastDetailPage id={params.id} />;
}
