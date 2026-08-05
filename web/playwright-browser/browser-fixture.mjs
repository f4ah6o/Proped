export const FIXTURE_URL = "http://fixture.local/browser-mode";

export const BROWSER_FIXTURE_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Proped Browser Fixture</title>
</head>
<body>
  <main aria-label="Browser fixture">
    <h1>Browser fixture</h1>
    <section aria-label="Search">
      <label for="search">Search</label>
      <input id="search" name="search" type="search" autocomplete="off">
      <output role="status" aria-label="Search results">idle</output>
    </section>

    <form aria-label="Profile">
      <label for="title">Title</label>
      <input id="title" name="title" type="text" value="Initial">
      <label for="number">Number</label>
      <input id="number" name="number" type="number" value="2">
      <button type="submit">Save</button>
      <output role="status" aria-label="Submit count">0</output>
    </form>

    <button type="button" id="open-details">Open details</button>
    <dialog aria-label="Details">
      <p>Deterministic dialog</p>
      <button type="button" id="close-details">Close details</button>
    </dialog>

    <button type="button" id="write-storage">Write storage</button>
    <button type="button" id="attempt-network">Attempt network</button>
    <button type="button" id="emit-warning">Emit warning</button>
  </main>
<script>
(() => {
  const state = {
    generation: 0,
    pendingSearch: [],
    pendingSubmit: [],
    searchQuery: "",
    searchResults: "idle",
    title: "Initial",
    numberText: "2",
    numberResult: 4,
    submitCount: 0,
    lastNetwork: "idle",
    pendingBrowserTasks: 0,
  };
  let submitId = 0;
  let opener = null;
  const search = document.getElementById("search");
  const title = document.getElementById("title");
  const number = document.getElementById("number");
  const form = document.querySelector("form");
  const searchOutput = document.querySelector('[aria-label="Search results"]');
  const submitOutput = document.querySelector('[aria-label="Submit count"]');
  const dialog = document.querySelector("dialog");

  function publish() {
    searchOutput.value = state.searchResults;
    searchOutput.textContent = state.searchResults;
    submitOutput.value = String(state.submitCount);
    submitOutput.textContent = String(state.submitCount);
  }

  search.addEventListener("input", () => {
    state.generation += 1;
    state.searchQuery = search.value;
    state.pendingSearch.push({
      id: "search-" + state.generation,
      generation: state.generation,
      query: search.value,
    });
    publish();
  });

  title.addEventListener("input", () => {
    state.title = title.value;
  });

  number.addEventListener("input", () => {
    state.numberText = number.value;
    state.numberResult = Number(number.value) * 2;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitId += 1;
    state.pendingSubmit.push({ id: "submit-" + submitId, title: state.title });
    state.submitCount += 1;
    publish();
  });

  document.getElementById("open-details").addEventListener("click", (event) => {
    opener = event.currentTarget;
    dialog.showModal();
    document.getElementById("close-details").focus();
  });

  document.getElementById("close-details").addEventListener("click", () => {
    dialog.close("close");
    opener?.focus();
  });

  document.getElementById("write-storage").addEventListener("click", () => {
    localStorage.setItem("fixture-mode", "browser");
    sessionStorage.setItem("fixture-seed", "17");
  });

  document.getElementById("emit-warning").addEventListener("click", () => {
    console.warn("fixture warning");
  });

  document.getElementById("attempt-network").addEventListener("click", async () => {
    state.lastNetwork = "pending";
    state.pendingBrowserTasks += 1;
    try {
      await fetch("https://blocked.invalid/data");
      state.lastNetwork = "unexpected-success";
    } catch (error) {
      state.lastNetwork = "denied";
      console.warn("network denied: " + error.name);
    } finally {
      state.pendingBrowserTasks -= 1;
    }
  });

  window.__fixture = {
    ready: true,
    state,
    deliverSearch(id) {
      const request = state.pendingSearch.find((item) => item.id === id);
      if (!request) return false;
      state.pendingSearch = state.pendingSearch.filter((item) => item.id !== id);
      // Deliberate fault: an older response is allowed to replace the latest result.
      state.searchResults = "results:" + request.query + ":generation:" + request.generation;
      publish();
      return true;
    },
    completeSubmit(id) {
      const exists = state.pendingSubmit.some((item) => item.id === id);
      state.pendingSubmit = state.pendingSubmit.filter((item) => item.id !== id);
      return exists;
    },
    closeDialog(kind = "close") {
      if (dialog.open) dialog.close(kind);
      opener?.focus();
    },
    snapshot() {
      return JSON.parse(JSON.stringify(state));
    },
  };
  publish();
  console.log("fixture ready");
})();
</script>
</body>
</html>`;
