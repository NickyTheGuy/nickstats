<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import SortHeading from './SortHeading.vue';

const props = defineProps({ model: Object, tableId: String });
const table = ref(null);
const widths = ref([]);
const details = computed(() => props.model.headings.filter(heading => heading.group).flatMap(heading => heading.columns));
const totalWidth = computed(() => widths.value.reduce((sum, width) => sum + width, 0));

// Measure the rendered content after Vue updates it, including long player names.
watch(() => props.model, async () => {
  widths.value = props.model.columns.map(column => column.minimumWidth);
  await nextTick();
  const node = table.value;
  if (!node) return;
  const measurement = node.cloneNode(true);
  measurement.removeAttribute('id');
  measurement.setAttribute('aria-hidden', 'true');
  Object.assign(measurement.style, { position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden', width: 'auto', minWidth: '0', tableLayout: 'auto' });
  document.body.appendChild(measurement);
  try {
    const headers = [...measurement.tHead.rows[0].cells].filter(cell => cell.rowSpan === 2).concat([...measurement.tHead.rows[1].cells]);
    widths.value = props.model.columns.map((column, index) => Math.ceil(Math.max(column.minimumWidth, headers[index]?.getBoundingClientRect().width || 0,
      ...[...measurement.tBodies[0].rows].map(row => row.cells[index].getBoundingClientRect().width))));
  } finally { measurement.remove(); }
}, { immediate: true, flush: 'post' });

async function toggleGroup(group) {
  props.model.actions.toggle(group);
  await nextTick();
  const wrap = table.value?.parentElement;
  const left = window.NickStatsScoreboard.scrollGroupIntoView(wrap, table.value, group);
  if (left != null) wrap.scrollLeft = left;
}
async function cycleGroup(group, button) {
  const wrap = table.value.parentElement;
  const viewportX = button.getBoundingClientRect().left + button.offsetWidth / 2;
  const scrollLeft = wrap.scrollLeft;
  props.model.actions.cycle(group);
  await nextTick();
  wrap.scrollLeft = scrollLeft;
  const control = table.value.querySelector(`[data-scoreboard-group="${group}"]`);
  if (control) wrap.scrollLeft += control.getBoundingClientRect().left + control.offsetWidth / 2 - viewportX;
}
function handleDetailShortcut(event) {
  if (event.key?.toLowerCase() !== 'r' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
  if (!table.value?.getClientRects().length) return;
  const shortcut = table.value.querySelector('[data-scoreboard-group]');
  if (!shortcut) return;
  event.preventDefault();
  cycleGroup(shortcut.dataset.scoreboardGroup, shortcut);
}
onMounted(() => document.addEventListener('keydown', handleDetailShortcut));
onBeforeUnmount(() => document.removeEventListener('keydown', handleDetailShortcut));
</script>

<template>
  <div class="player-profile-table-wrap">
    <table :id="tableId" ref="table" :class="model.tableClass" :style="{ width: '100%', minWidth: `${totalWidth}px` }">
      <colgroup><col v-for="(width, index) in widths" :key="model.columns[index]?.key" :style="{ width: `${width}px` }"></colgroup>
      <thead>
        <tr>
          <template v-for="(heading, index) in model.headings" :key="heading.group || index">
            <th v-if="heading.group" class="demo-toggle-heading demo-group-start demo-group-end"
              :class="`${heading.group}-heading`" :colspan="heading.columns.length" :data-scoreboard-header="heading.group">
              <div class="demo-column-heading-actions">
                <button type="button" class="demo-column-toggle" :aria-expanded="heading.expanded"
                  @click="toggleGroup(heading.group)">{{ heading.title }} {{ heading.expanded ? '▾' : '▸' }}</button>
                <button v-if="heading.shortcut" type="button" class="demo-subgroup-shortcut" :data-scoreboard-group="heading.group"
                  :title="heading.shortcut" :aria-label="heading.shortcut" @click="cycleGroup(heading.group, $event.currentTarget)"><span>R</span></button>
              </div>
            </th>
            <template v-else>
              <th v-for="column in heading.columns" :key="column.key" rowspan="2" scope="col" :aria-sort="column.ariaSort" :title="column.description">
                <SortHeading :column="column" @sort="model.actions.sort" />
              </th>
            </template>
          </template>
        </tr>
        <tr>
          <th v-for="column in details" :key="column.key" scope="col" class="demo-group-detail"
            :class="[`${column.group}-cell`, { 'demo-group-start': column.groupStart, 'demo-group-end': column.groupEnd }]"
            :aria-sort="column.ariaSort" :title="column.description">
            <SortHeading :column="column" @sort="model.actions.sort" />
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in model.rows" :key="row.id">
          <component :is="index === 0 ? 'th' : 'td'" v-for="(cell, index) in row.cells" :key="cell.key"
            :scope="index === 0 ? 'row' : undefined" :class="cell.className">{{ cell.text }}</component>
        </tr>
      </tbody>
    </table>
  </div>
</template>
