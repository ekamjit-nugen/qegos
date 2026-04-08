import { UserDetailPage } from './_components/UserDetailPage';

export default function Page({ params }: { params: { id: string } }): React.ReactNode {
  return <UserDetailPage id={params.id} />;
}
