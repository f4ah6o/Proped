export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  return {
    status: "described",
    sequence: Number(body?.sequence ?? 0),
    title: String(body?.title ?? ""),
    effect: {
      kind: "nitro-server-route",
      method: "POST",
      policy: "descriptor-only",
      externalMutation: false,
    },
  };
});
