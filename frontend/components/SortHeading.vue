<script setup>
defineProps({ column: Object });
defineEmits(['sort']);
</script>

<template>
  <button type="button" class="player-table-sort-button" :class="{ active: column.direction }"
    :data-direction="column.direction" @click="$emit('sort', column)">{{ column.label }}</button>
</template>
