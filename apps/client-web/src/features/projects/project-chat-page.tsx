import { useParams } from "react-router-dom";

import { useAuth } from "../../app/auth.js";
import { TestAiChatPage3 } from "../ai-chat/test-ai-chat-page-3.js";

export function ProjectChatPage() {
  const { projectId } = useParams();
  const { projects } = useAuth();
  const project = projects.find((item) => item.id === projectId || item.slug === projectId);

  return <TestAiChatPage3 projectName={project?.name ?? "Projet"} />;
}
