<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
    <main class="flex-1 min-w-0">
      <RouterView />
    </main>
  </div>
</template>
