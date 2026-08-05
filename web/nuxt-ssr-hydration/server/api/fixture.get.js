export default defineEventHandler((event) => {
  const query = getQuery(event);
  const caseName = query.case === "mismatch" ? "mismatch" : "stable";
  return {
    kind: "nitro-server-route",
    method: "GET",
    caseName,
    asyncValue: `async-${caseName}`,
    externalMutation: false,
  };
});
