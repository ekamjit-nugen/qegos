import { ChatDetailPage } from './_components/ChatDetailPage';

export default function Page({ params }: { params: { id: string } }): React.ReactNode {
  return <ChatDetailPage id={params.id} />;
}
