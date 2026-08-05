<script setup>
const route = useRoute();
const caseName = computed(() => route.query.case === "mismatch" ? "mismatch" : "stable");
const serverLabel = computed(() => caseName.value === "mismatch" ? "server-nuxt" : "stable-nuxt");
const hydrationLabel = ref(
  caseName.value === "mismatch"
    ? (import.meta.server ? "server-nuxt" : "client-nuxt")
    : "stable-nuxt",
);
const middleware = useState("fixture-middleware", () => ({ entered: false }));
const { data: asyncData } = await useAsyncData(
  `fixture-${caseName.value}`,
  () => $fetch("/api/fixture", { query: { case: caseName.value } }),
);
const title = ref("");
const sequence = ref(0);
const actionResult = ref({ status: "idle", sequence: 0, title: "", effect: null });
const ready = ref(false);

async function describe() {
  sequence.value += 1;
  actionResult.value = await $fetch("/api/describe", {
    method: "POST",
    body: { title: title.value, sequence: sequence.value },
  });
}

onMounted(() => {
  ready.value = true;
});


</script>

<template>
  <main
    :data-ready="ready ? 'true' : 'false'"
    data-framework="nuxt"
    :data-case="caseName"
    :data-server-label="serverLabel"
    :data-client-label="caseName === 'mismatch' ? 'client-nuxt' : 'stable-nuxt'"
    :data-async-value="asyncData?.asyncValue ?? ''"
    :data-middleware-entered="middleware?.entered ? 'true' : 'false'"
    data-server-route="descriptor-only"
  >
    <h1>Nuxt SSR hydration fixture</h1>
    <p id="hydration-label">{{ hydrationLabel }}</p>
    <p data-testid="async-data">{{ JSON.stringify(asyncData) }}</p>
    <p data-testid="middleware">{{ JSON.stringify(middleware) }}</p>
    <form @submit.prevent="describe">
      <label for="title">Title</label>
      <input id="title" v-model="title" name="title">
      <button type="submit">Describe route</button>
    </form>
    <output data-testid="server-route-result">{{ JSON.stringify(actionResult) }}</output>
  </main>
</template>
