<script setup>
const props = defineProps({ model: Object });
const valueModes = [['totals', 'Totals'], ['round', 'Per round'], ['match', 'Per match']];
const defaults = ['overview', 'opening', 'rounds'];
function toggleSection(key) {
  const selected = new Set(props.model.sections.filter(section => section.active).map(section => section.key));
  selected.has(key) ? selected.delete(key) : selected.add(key);
  props.model.actions.sections(selected);
}
</script>

<template>
  <div class="quick-comparison-controls">
    <div class="quick-comparison-sections">
      <div class="scoreboard-section-bar scoreboard-control-row">
        <strong>Sections</strong>
        <div class="scoreboard-button-group scoreboard-section-buttons">
          <button type="button" class="scoreboard-preset-button" @click="model.actions.sections(defaults)">Default</button>
          <button type="button" class="scoreboard-preset-button" @click="model.actions.sections(model.sections.map(section => section.key))">All</button>
          <button v-for="section in model.sections" :key="section.key" type="button" class="scoreboard-section-button"
            :class="[`${section.style}-heading`, { active: section.active }]" :aria-pressed="section.active"
            @click="toggleSection(section.key)">{{ section.label }}</button>
        </div>
      </div>
      <div class="scoreboard-value-toggle scoreboard-control-row">
        <strong>Values</strong>
        <div class="scoreboard-button-group">
          <button v-for="[value, label] in valueModes" :key="value" type="button" :class="{ active: model.valueMode === value }"
            :aria-pressed="model.valueMode === value" @click="model.actions.valueMode(value)">{{ label }}</button>
        </div>
        <div class="scoreboard-utility-basis">
          <span>Utility yields</span>
          <button type="button" :disabled="model.valueMode === 'totals'" :class="{ active: model.perGrenadeUtility }"
            :aria-pressed="model.perGrenadeUtility" title="Use each relevant grenade type for damage, flash effects, and flash-assist yields"
            @click="model.actions.utilityBasis()">Per grenade</button>
        </div>
        <small class="scoreboard-control-note">{{ model.modeNote }}</small>
      </div>
    </div>
  </div>
</template>
