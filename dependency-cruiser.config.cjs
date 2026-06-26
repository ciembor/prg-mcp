module.exports = {
  forbidden: [
    {
      name: "no-cycles",
      severity: "error",
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: "domain-does-not-depend-on-outer-layers",
      severity: "error",
      from: { path: "^src/features/[^/]+/domain/" },
      to: { path: "^src/features/[^/]+/(application|infrastructure|mcp)/" },
    },
    {
      name: "application-does-not-depend-on-mcp",
      severity: "error",
      from: { path: "^src/features/[^/]+/application/" },
      to: { path: "^src/features/[^/]+/mcp/" },
    },
    {
      name: "infrastructure-does-not-depend-on-mcp",
      severity: "error",
      from: { path: "^src/features/[^/]+/infrastructure/" },
      to: { path: "^src/features/[^/]+/mcp/" },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
  },
};
