import { FormMappingDetailPage } from '../_components/FormMappingDetailPage';

export default function Page({
  params,
}: {
  params: { mappingId: string };
}): React.ReactNode {
  return <FormMappingDetailPage mappingId={params.mappingId} />;
}
