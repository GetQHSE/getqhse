import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@qhse/ui/components/card";
import { Skeleton } from "@qhse/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@qhse/ui/components/tabs";
import { PlusIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAdminAuth } from "../../auth.js";
import { adminApi } from "../../lib/admin-api.js";
import { LlmSettingsTab } from "./llm-settings-tab.js";

type EmbeddingProfile = {
  id: string;
  key: string;
  provider: string;
  model: string;
  dimensions: number;
  version: number;
  status: string;
  missingChunks: number;
  complete: boolean;
  activatable: boolean;
};
type IndexingReadiness = {
  searchable: boolean;
  reason: string | null;
  message: string | null;
  ragEnabled: boolean;
  openAiConfigured: boolean;
  searchableChunks: number;
  profiles: EmbeddingProfile[];
};

export function SettingsPage() {
  const { user } = useAdminAuth();
  const canManage = user?.platformRole !== "support";
  const [readiness, setReadiness] = useState<IndexingReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    void adminApi<IndexingReadiness>("/v1/documents/embedding-profiles")
      .then(setReadiness)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unable to load embedding profiles"),
      );
  }, []);
  useEffect(load, [load]);

  async function createProfile() {
    setBusy("create");
    setError(null);
    try {
      await adminApi("/v1/documents/embedding-profiles", { method: "POST" });
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create a profile");
    } finally {
      setBusy(null);
    }
  }

  async function activateProfile(profileId: string) {
    setBusy(`activate-${profileId}`);
    setError(null);
    try {
      await adminApi(`/v1/documents/embedding-profiles/${profileId}/activate`, {
        method: "POST",
      });
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Activation failed");
    } finally {
      setBusy(null);
    }
  }

  const building = readiness?.profiles.some((profile) => profile.status === "BUILDING") ?? false;

  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-6">
      <header>
        <p className="text-sm font-medium text-violet-700">Administration</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-slate-600">
          Platform-wide configuration for the administration workspace.
        </p>
      </header>
      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      <Tabs defaultValue="search-index" className="min-w-0">
        <TabsList variant="line">
          <TabsTrigger value="search-index">Search index</TabsTrigger>
          <TabsTrigger value="llm">LLM</TabsTrigger>
        </TabsList>
        <TabsContent value="search-index">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Embedding profiles</CardTitle>
              {canManage ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null || building}
                  onClick={() => void createProfile()}
                >
                  <PlusIcon /> {busy === "create" ? "Creating…" : "New profile"}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This index supports document search. Regulatory analysis reads the approved law
                catalog directly and does not require an embedding profile.
              </p>
              {!readiness ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={readiness.ragEnabled ? "secondary" : "destructive"}>
                      {readiness.ragEnabled ? "RAG enabled" : "RAG disabled"}
                    </Badge>
                    <Badge variant={readiness.openAiConfigured ? "secondary" : "destructive"}>
                      {readiness.openAiConfigured ? "OpenAI configured" : "OpenAI not configured"}
                    </Badge>
                    <Badge variant={readiness.searchable ? "default" : "outline"}>
                      {readiness.searchable
                        ? "Platform search available"
                        : (readiness.message ?? "Platform search not yet available")}
                    </Badge>
                    <Badge variant="outline">
                      {readiness.searchableChunks} searchable chunk(s)
                    </Badge>
                  </div>
                  {readiness.profiles.length ? (
                    <div className="space-y-2">
                      {readiness.profiles.map((profile) => (
                        <div
                          key={profile.id}
                          className="flex items-center justify-between rounded-xl border p-4"
                        >
                          <div>
                            <p className="text-sm font-medium">{profile.key}</p>
                            <p className="text-xs text-muted-foreground">
                              v{profile.version} · {profile.provider} · {profile.dimensions}{" "}
                              dimensions · {profile.missingChunks} chunk(s) not yet embedded
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={profile.status === "ACTIVE" ? "default" : "outline"}>
                              {profile.status.toLowerCase()}
                            </Badge>
                            {canManage && profile.activatable && profile.status !== "ACTIVE" ? (
                              <Button
                                size="sm"
                                disabled={busy !== null}
                                onClick={() => void activateProfile(profile.id)}
                              >
                                {busy === `activate-${profile.id}` ? "Activating…" : "Activate"}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No embedding profile exists yet. Documents will create one automatically the
                      first time their search index is built, or you can create one here.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="llm">
          <LlmSettingsTab canManage={canManage} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
