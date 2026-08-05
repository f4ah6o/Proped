"use server";

export async function describeServerAction(previousState, formData) {
  const title = String(formData.get("title") ?? "");
  return {
    status: "described",
    sequence: Number(previousState?.sequence ?? 0) + 1,
    title,
    effect: {
      kind: "server-action",
      policy: "descriptor-only",
      externalMutation: false,
    },
  };
}
