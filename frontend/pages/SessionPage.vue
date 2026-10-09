<script setup>
import ComparisonControls from '../components/ComparisonControls.vue';
import Scoreboard from '../components/Scoreboard.vue';

defineProps({ status: Object, model: Object, onRetry: Function });
</script>

<template>
  <header class="section-head">
    <div><h2>Session</h2><p id="sessionQuickMeta">{{ model?.meta }}</p></div>
  </header>
  <p id="sessionStatus" role="status" aria-live="polite" :class="{ error: status.error }">
    {{ status.error || (status.loading ? 'Loading session…' : '') }}
  </p>
  <button id="sessionRetry" type="button" class="button button-secondary" :hidden="!status.error" @click="onRetry">Retry</button>
  <div id="sessionContent" :hidden="!status.ready">
    <template v-if="model">
      <ComparisonControls :model="model" />
      <nav id="sessionQuickMaps" class="match-browser-tabs quick-comparison-map-tabs" role="tablist" aria-label="Session maps">
        <button v-for="[value, label] in model.maps" :key="value" type="button" role="tab"
          class="match-browser-tab" :class="{ active: model.map === value }"
          :aria-selected="model.map === value" :tabindex="model.map === value ? 0 : -1"
          @click="model.actions.map(value)">{{ label }}</button>
      </nav>
      <Scoreboard :model="model" table-id="sessionQuickTable" />
      <p id="sessionQuickEmpty" class="quick-comparison-empty" :hidden="!model.empty">No qualifying matches for this map.</p>
    </template>
  </div>
</template>
