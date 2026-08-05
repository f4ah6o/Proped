import React, {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useState,
} from "react";

export const FaultyReactForm = forwardRef(function FaultyReactForm(
  { onState },
  ref,
) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState("");
  const [generation, setGeneration] = useState(0);
  const [nextSearchId, setNextSearchId] = useState(1);
  const [pendingSearch, setPendingSearch] = useState([]);
  const [title, setTitle] = useState("");
  const [nextSubmitId, setNextSubmitId] = useState(1);
  const [pendingSubmit, setPendingSubmit] = useState([]);
  const [numberText, setNumberText] = useState("2");
  const [numberResult, setNumberResult] = useState(4);

  function changeSearch(value) {
    const nextGeneration = generation + 1;
    const request = {
      id: nextSearchId,
      generation: nextGeneration,
      query: value,
    };
    setSearchQuery(value);
    setGeneration(nextGeneration);
    setNextSearchId(nextSearchId + 1);
    setPendingSearch((current) => [...current, request]);
  }

  function deliverSearch(id) {
    const request = pendingSearch.find((item) => item.id === id);
    if (!request) return;
    // Intentional fault: stale responses are accepted without generation checks.
    setSearchResults(request.query);
    setPendingSearch((current) => current.filter((item) => item.id !== id));
  }

  function submit(event) {
    event?.preventDefault();
    // Intentional fault: invalid and duplicate submissions are both accepted.
    const request = { id: nextSubmitId, title };
    setNextSubmitId(nextSubmitId + 1);
    setPendingSubmit((current) => [...current, request]);
  }

  function completeSubmit(id) {
    setPendingSubmit((current) => current.filter((item) => item.id !== id));
  }

  function changeNumber(value) {
    setNumberText(value);
    const parsed = Number(value);
    // Intentional fault: invalid input destroys the previous valid result.
    setNumberResult(Number.isFinite(parsed) ? parsed * 2 : null);
  }

  const state = {
    searchQuery,
    searchResults,
    generation,
    pendingSearch,
    title,
    pendingSubmit,
    numberText,
    numberResult,
  };

  useLayoutEffect(() => onState(state));
  useImperativeHandle(ref, () => ({
    deliverSearch,
    completeSubmit,
    state: () => state,
  }));

  return React.createElement(
    "main",
    { "aria-label": "React component fixture" },
    React.createElement(
      "form",
      { "aria-label": "Profile", onSubmit: submit },
      React.createElement("label", { htmlFor: "search" }, "Search"),
      React.createElement("input", {
        id: "search",
        type: "search",
        value: searchQuery,
        onChange: (event) => changeSearch(event.target.value),
      }),
      React.createElement(
        "output",
        { "aria-label": "Search results" },
        searchResults,
      ),
      React.createElement("label", { htmlFor: "title" }, "Title"),
      React.createElement("input", {
        id: "title",
        value: title,
        onChange: (event) => setTitle(event.target.value),
      }),
      React.createElement("label", { htmlFor: "number" }, "Number"),
      React.createElement("input", {
        id: "number",
        type: "number",
        value: numberText,
        onChange: (event) => changeNumber(event.target.value),
      }),
      React.createElement(
        "output",
        { "aria-label": "Number result" },
        numberResult == null ? "invalid" : String(numberResult),
      ),
      React.createElement("button", { type: "submit" }, "Submit"),
    ),
    React.createElement(
      "section",
      { "aria-label": "Pending effects" },
      React.createElement(
        "span",
        { "data-search-count": pendingSearch.length },
        `search=${pendingSearch.length}`,
      ),
      React.createElement(
        "span",
        { "data-submit-count": pendingSubmit.length },
        `submit=${pendingSubmit.length}`,
      ),
    ),
  );
});
