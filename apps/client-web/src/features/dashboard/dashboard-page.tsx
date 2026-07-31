export function DashboardPage() {
  const metrics = [
    { label: "Audits en cours", value: "4" },
    { label: "Conformité globale", value: "86%" },
    { label: "Actions en retard", value: "3" },
  ];
  return (
    <section>
      <h1 className="text-3xl font-semibold">Tableau de bord</h1>
      <p className="mt-2 text-slate-600">Vue synthétique de votre périmètre QHSE.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {metrics.map((metric) => (
          <article key={metric.label} className="rounded-xl border bg-white p-5">
            <p className="text-sm text-slate-600">{metric.label}</p>
            <p className="mt-2 text-3xl font-semibold text-teal-800">{metric.value}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
