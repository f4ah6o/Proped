import {
  defineAsyncComponent,
  defineComponent,
  h,
  ref,
  Suspense,
  Teleport,
} from "vue";
import { defineStore, storeToRefs } from "pinia";

export const useProfileStore = defineStore("profile", () => {
  const title = ref("");
  const nextSubmitId = ref(1);
  const pendingSubmit = ref([]);

  function submit() {
    // Intentional fault: duplicate submissions are accepted while one is pending.
    pendingSubmit.value.push({ id: nextSubmitId.value, title: title.value });
    nextSubmitId.value += 1;
  }

  function completeSubmit(id) {
    pendingSubmit.value = pendingSubmit.value.filter((item) => item.id !== id);
  }

  return { title, nextSubmitId, pendingSubmit, submit, completeSubmit };
});

const AsyncStatus = defineAsyncComponent(() => Promise.resolve(defineComponent({
  name: "AsyncStatus",
  setup() {
    return () => h("output", { "aria-label": "Suspense status" }, "ready");
  },
})));

export const FaultyVueForm = defineComponent({
  name: "FaultyVueForm",
  emits: ["state"],
  setup(_, { emit, expose }) {
    const searchQuery = ref("");
    const searchResults = ref("");
    const generation = ref(0);
    const nextSearchId = ref(1);
    const pendingSearch = ref([]);
    const numberText = ref("2");
    const numberResult = ref(4);
    const store = useProfileStore();
    const { title, pendingSubmit } = storeToRefs(store);

    function publish() {
      const state = {
        searchQuery: searchQuery.value,
        searchResults: searchResults.value,
        generation: generation.value,
        pendingSearch: pendingSearch.value.map((item) => ({ ...item })),
        title: title.value,
        pendingSubmit: pendingSubmit.value.map((item) => ({ ...item })),
        numberText: numberText.value,
        numberResult: numberResult.value,
      };
      emit("state", state);
      return state;
    }

    function changeSearch(value) {
      generation.value += 1;
      pendingSearch.value.push({
        id: nextSearchId.value,
        generation: generation.value,
        query: value,
      });
      nextSearchId.value += 1;
      searchQuery.value = value;
      publish();
    }

    function deliverSearch(id) {
      const request = pendingSearch.value.find((item) => item.id === id);
      if (!request) return;
      // Intentional fault: stale responses are accepted without generation checks.
      searchResults.value = request.query;
      pendingSearch.value = pendingSearch.value.filter((item) => item.id !== id);
      publish();
    }

    function submit(event) {
      event?.preventDefault();
      store.submit();
      publish();
    }

    function completeSubmit(id) {
      store.completeSubmit(id);
      publish();
    }

    function changeNumber(value) {
      numberText.value = value;
      const parsed = Number(value);
      // Intentional fault: invalid input destroys the previous valid result.
      numberResult.value = Number.isFinite(parsed) ? parsed * 2 : null;
      publish();
    }

    expose({ deliverSearch, completeSubmit, state: publish });

    return () => h("main", { "aria-label": "Vue component fixture" }, [
      h("form", { "aria-label": "Profile", onSubmit: submit }, [
        h("label", { for: "search" }, "Search"),
        h("input", {
          id: "search",
          type: "search",
          value: searchQuery.value,
          onInput: (event) => changeSearch(event.target.value),
        }),
        h("output", { "aria-label": "Search results" }, searchResults.value),
        h("label", { for: "title" }, "Title"),
        h("input", {
          id: "title",
          value: title.value,
          onInput: (event) => {
            title.value = event.target.value;
            publish();
          },
        }),
        h("label", { for: "number" }, "Number"),
        h("input", {
          id: "number",
          type: "number",
          value: numberText.value,
          onInput: (event) => changeNumber(event.target.value),
        }),
        h("output", { "aria-label": "Number result" },
          numberResult.value == null ? "invalid" : String(numberResult.value)),
        h("button", { type: "submit" }, "Submit"),
      ]),
      h(Suspense, null, {
        default: () => h(AsyncStatus),
        fallback: () => h("output", { "aria-label": "Suspense status" }, "loading"),
      }),
      h(Teleport, { to: "#teleport" }, [
        h("section", { "aria-label": "Teleport boundary" }, [
          h("span", { "data-search-count": pendingSearch.value.length },
            `search=${pendingSearch.value.length}`),
          h("span", { "data-submit-count": pendingSubmit.value.length },
            `submit=${pendingSubmit.value.length}`),
          h("span", { "data-pinia-title": title.value }, `title=${title.value}`),
        ]),
      ]),
    ]);
  },
});
