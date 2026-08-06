<!-- Reviewed boundary derived from the MIT-licensed create-vite Vue template. -->
<!-- Upstream remains read-only; this reduced fixture preserves only the counter state transition. -->
<script setup>
import { ref } from 'vue'

const count = ref(0)
</script>

<template>
  <button type="button" @click="count++">count is {{ count }}</button>
</template>
