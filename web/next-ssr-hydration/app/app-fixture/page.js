import AppFixtureClient from "./client";

export const dynamic = "force-dynamic";

export default async function AppFixturePage({ searchParams }) {
  const params = await searchParams;
  const caseName = params?.case === "mismatch" ? "mismatch" : "stable";
  const serverLabel = caseName === "mismatch" ? "server-app" : "stable-app";
  const clientLabel = caseName === "mismatch" ? "client-app" : "stable-app";
  return (
    <AppFixtureClient
      caseName={caseName}
      serverLabel={serverLabel}
      clientLabel={clientLabel}
    />
  );
}
