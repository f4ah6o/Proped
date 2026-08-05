import { useState } from "react";

export default function PagesFixture({ caseName, serverLabel, clientLabel }) {
  const [attempts, setAttempts] = useState(0);
  const hydrationLabel = typeof window === "undefined" ? serverLabel : clientLabel;
  return (
    <main
      aria-label="Next Pages Router fixture"
      data-router="pages"
      data-case={caseName}
      data-ready="true"
    >
      <h1>Pages Router</h1>
      <p id="hydration-label" data-testid="hydration-label">
        {hydrationLabel}
      </p>
      <button
        type="button"
        onClick={() => {
          setAttempts((value) => value + 1);
          console.warn("unsupported_effect:pages-router-server-action");
        }}
      >
        Attempt server action
      </button>
      <output aria-label="Server Action diagnostic" data-testid="server-action-diagnostic">
        {JSON.stringify({
          kind: "unsupported_effect",
          effect: "server-action",
          router: "pages",
          attempts,
        })}
      </output>
      <script
        id="fixture-metadata"
        type="application/json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            router: "pages",
            caseName,
            serverLabel,
            clientLabel,
            serverAction: "unsupported",
          }).replaceAll("<", "\\u003c"),
        }}
      />
    </main>
  );
}

export function getServerSideProps(context) {
  const caseName = context.query.case === "mismatch" ? "mismatch" : "stable";
  return {
    props: {
      caseName,
      serverLabel: caseName === "mismatch" ? "server-pages" : "stable-pages",
      clientLabel: caseName === "mismatch" ? "client-pages" : "stable-pages",
    },
  };
}
