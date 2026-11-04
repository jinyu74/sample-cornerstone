import { requireUser } from "@/shared/auth/server";
import { StudyListPage } from "@/views/study-list";

export default async function HomePage() {
  await requireUser("/");
  return <StudyListPage />;
}
