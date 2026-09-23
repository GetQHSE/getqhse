import { zodResolver } from "@hookform/resolvers/zod";
import { QhseApiClient } from "@qhse/api-client";
import { createSiteSchema, type CreateSite } from "@qhse/contracts";
import { Button } from "@qhse/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { API_BASE_URL } from "../../app/api-url.js";

const api = new QhseApiClient({
  baseUrl: API_BASE_URL,
});

export function SitesPage({
  client = api,
}: {
  client?: Pick<QhseApiClient, "listSites" | "createSite">;
}) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("workspace");
  const sites = useQuery({ queryKey: ["sites"], queryFn: () => client.listSites() });
  const form = useForm<CreateSite>({
    resolver: zodResolver(createSiteSchema),
    defaultValues: { name: "", code: "", address: null },
  });
  const create = useMutation({
    mutationFn: (input: CreateSite) => client.createSite(input),
    onSuccess: async () => {
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ["sites"] });
    },
  });

  return (
    <section>
      <h1 className="text-3xl font-semibold">{t("sites.title")}</h1>
      <form
        className="mt-6 grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-4"
        onSubmit={(event) => void form.handleSubmit((input) => create.mutateAsync(input))(event)}
      >
        <label>
          <span className="block text-sm">{t("sites.name")}</span>
          <input className="mt-1 w-full rounded border px-3 py-2" {...form.register("name")} />
        </label>
        <label>
          <span className="block text-sm">{t("sites.code")}</span>
          <input className="mt-1 w-full rounded border px-3 py-2" {...form.register("code")} />
        </label>
        <label>
          <span className="block text-sm">{t("sites.address")}</span>
          <input className="mt-1 w-full rounded border px-3 py-2" {...form.register("address")} />
        </label>
        <Button className="self-end" type="submit" disabled={create.isPending}>
          {t("sites.create")}
        </Button>
      </form>
      {sites.isLoading && (
        <p role="status" className="mt-6">
          {t("loading", { ns: "common" })}
        </p>
      )}
      {sites.isError && (
        <p role="alert" className="mt-6 text-red-700">
          {t("sites.loadFailed")}
        </p>
      )}
      <ul className="mt-6 divide-y rounded-xl border bg-white">
        {sites.data?.data.map((site) => (
          <li className="flex justify-between p-4" key={site.id}>
            <span>{site.name}</span>
            <span className="text-slate-500">{site.code}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
