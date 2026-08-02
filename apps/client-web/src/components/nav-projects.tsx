import { Link } from "react-router-dom";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@qhse/ui/components/sidebar";
import { FolderKanbanIcon, PlusIcon } from "lucide-react";

export type SidebarProject = { name: string; url: string };

export function NavProjects({ projects }: { projects: SidebarProject[] }) {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Projets</SidebarGroupLabel>
      <SidebarMenu>
        {projects.map((project) => (
          <SidebarMenuItem key={project.url}>
            <SidebarMenuButton render={<Link to={project.url} />}>
              <FolderKanbanIcon />
              <span>{project.name}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
        <SidebarMenuItem>
          <SidebarMenuButton
            className="text-sidebar-foreground/70"
            render={<Link to="/onboarding/project" />}
          >
            <PlusIcon className="text-sidebar-foreground/70" />
            <span>Nouveau projet</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
