import { AppointmentDetailPage } from './_components/AppointmentDetailPage';

export default function Page({ params }: { params: { id: string } }): React.ReactNode {
  return <AppointmentDetailPage id={params.id} />;
}
