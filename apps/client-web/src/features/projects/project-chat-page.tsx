import { useParams } from "react-router-dom";

import { ProjectProfileChat } from "./project-profile-chat.js";

export function ProjectChatPage() {
  const { projectId } = useParams();
  if (!projectId) return null;
  return <ProjectProfileChat projectIdOrSlug={projectId} />;
}
