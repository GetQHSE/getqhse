import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@qhse/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@qhse/ui/components/sidebar";
import { CheckIcon, ChevronsUpDownIcon, FolderKanbanIcon, PlusIcon } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

export type SidebarProject = { id: string; name: string; slug: string };

export function ProjectSwitcher({
  projects,
  activeProject,
}: {
  projects: SidebarProject[];
  activeProject?: SidebarProject | undefined;
}) {
  const { isMobile } = useSidebar();
  const navigate = useNavigate();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="border border-white/10 bg-white/[0.04] data-open:bg-white/10"
              />
            }
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-violet-500/20 text-violet-300">
              <FolderKanbanIcon className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">
                {activeProject?.name ?? "Choisir un projet"}
              </span>
              <span className="truncate text-xs text-slate-400">Espace projet</span>
            </div>
            <ChevronsUpDownIcon className="ml-auto size-4 text-slate-500" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-64"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={8}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Projets
              </DropdownMenuLabel>
              {projects.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  className="gap-2 p-2"
                  onClick={() => void navigate(`/projects/${project.slug}/chat`)}
                >
                  <div className="grid size-7 place-items-center rounded-lg bg-violet-50 text-violet-700">
                    <FolderKanbanIcon className="size-3.5" />
                  </div>
                  <span className="flex-1 truncate">{project.name}</span>
                  {activeProject?.id === project.id && (
                    <CheckIcon className="size-4 text-violet-600" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2" render={<Link to="/projects/new" />}>
              <div className="grid size-7 place-items-center rounded-lg border">
                <PlusIcon className="size-3.5" />
              </div>
              <span className="font-medium">Nouveau projet</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
