module.exports = {
  forbidden: [
    {
      name: "apps-must-not-import-apps",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/", pathNot: "^apps/$1/" },
    },
    {
      name: "domain-is-framework-independent",
      from: { path: "^packages/domain/" },
      to: {
        path: "(@nestjs|@prisma|ioredis|bullmq|@aws-sdk|axios|services/docling)",
      },
    },
    {
      name: "frontend-must-not-import-database",
      from: { path: "^apps/(client|admin)-web/" },
      to: { path: "^packages/database/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: { exportsFields: ["exports"] },
  },
};
