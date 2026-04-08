import { TicketDetailPage } from './_components/TicketDetailPage';

export default function Page({ params }: { params: { id: string } }): React.ReactNode {
  return <TicketDetailPage id={params.id} />;
}
