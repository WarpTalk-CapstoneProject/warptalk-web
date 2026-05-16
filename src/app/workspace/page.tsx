export default function WorkspaceDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Workspace Overview</h1>
        <p className="text-muted-foreground">
          Metrics and usage for your organization.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Credits Used</h3>
          </div>
          <div className="text-2xl font-bold">45,000</div>
          <p className="text-xs text-muted-foreground">Reset in 12 days</p>
        </div>
      </div>
    </div>
  );
}
