"use client";

import { useActionState } from "react";
import { describeServerAction } from "./actions";

const INITIAL_ACTION = {
  status: "idle",
  sequence: 0,
  title: "",
  effect: null,
};

export default function AppFixtureClient({ caseName, serverLabel, clientLabel }) {
  const [actionState, formAction, pending] = useActionState(
    describeServerAction,
    INITIAL_ACTION,
  );
  const hydrationLabel = typeof window === "undefined" ? serverLabel : clientLabel;

  return (
    <main
      aria-label="Next App Router fixture"
      data-router="app"
      data-case={caseName}
      data-ready="true"
    >
      <h1>App Router</h1>
      <p id="hydration-label" data-testid="hydration-label">
        {hydrationLabel}
      </p>
      <form action={formAction} aria-label="Server Action">
        <label htmlFor="app-title">Title</label>
        <input id="app-title" name="title" defaultValue="Initial" />
        <button type="submit" disabled={pending}>Describe action</button>
      </form>
      <output aria-label="Server Action result" data-testid="server-action-result">
        {JSON.stringify(actionState)}
      </output>
      <script
        id="fixture-metadata"
        type="application/json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            router: "app",
            caseName,
            serverLabel,
            clientLabel,
            serverAction: "descriptor-only",
          }).replaceAll("<", "\\u003c"),
        }}
      />
    </main>
  );
}
