import { listCatalogStudies } from "@/entities/dicom-study/server";
import { requireUser } from "@/shared/auth/server";
import { StudyListPage } from "@/views/study-list";

/**
 * 검사 목록. 서버에서 계정을 확인한 뒤 그 계정의 서버 목록(RLS)을 읽어 props 로 넘기므로
 * 행이 최초 HTML 에 들어간다. 사용자별 응답은 Proxy 가 no-store 로 내보낸다.
 */
export default async function HomePage() {
  await requireUser("/");
  const serverCatalog = await listCatalogStudies();
  return <StudyListPage serverCatalog={serverCatalog} />;
}
