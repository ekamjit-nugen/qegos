import { FormMappingVersionEditor } from '../../../_components/FormMappingVersionEditor';

export default function Page({
  params,
}: {
  params: { mappingId: string; version: string };
}): React.ReactNode {
  return (
    <FormMappingVersionEditor
      mappingId={params.mappingId}
      version={Number(params.version)}
    />
  );
}
