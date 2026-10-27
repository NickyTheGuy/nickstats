export const defaultSections = ['overview', 'opening', 'rounds'];
export const valueModes = [['totals', 'Totals'], ['round', 'Per round'], ['match', 'Per match']];

export function initialComparisonState(config) {
  return { map: 'ALL', valueMode: 'totals', perGrenadeUtility: false, sort: null,
    expandedGroups: Object.fromEntries(config.groups.map(([key]) => [key, false])), sectionSubgroups: {} };
}

export function withSections(state, sections, config) {
  const visible = new Set(sections);
  return { ...state,
    expandedGroups: Object.fromEntries(Object.entries(state.expandedGroups).map(([group, expanded]) =>
      [group, expanded && visible.has(config.groupSection[group])])),
    sort: state.sort?.group && !visible.has(config.groupSection[state.sort.group]) ? null : state.sort };
}

export function comparisonReducer(state, action, config) {
  switch (action.type) {
    case 'reset': return initialComparisonState(config);
    case 'map': return { ...state, map: action.value };
    case 'sections': {
      const next = withSections(state, action.value, config);
      return next.sort === state.sort && Object.keys(state.expandedGroups).every(group => next.expandedGroups[group] === state.expandedGroups[group]) ? state : next;
    }
    case 'valueMode': return { ...state, valueMode: action.value, sort: null };
    case 'utilityBasis': return { ...state, perGrenadeUtility: !state.perGrenadeUtility, sort: null };
    case 'toggle': {
      const next = !state.expandedGroups[action.group];
      const sortedGroup = state.sort?.group;
      const disappears = sortedGroup === action.group || (next && sortedGroup && state.expandedGroups[sortedGroup]);
      return { ...state, sort: disappears ? null : state.sort,
        expandedGroups: Object.fromEntries(Object.keys(state.expandedGroups).map(group => [group, group === action.group && next])) };
    }
    case 'cycle': {
      const options = config.subgroups[action.group];
      if (!options?.length) return state;
      const index = Math.max(0, options.findIndex(([key]) => key === state.sectionSubgroups[action.group]));
      return { ...state, sort: state.sort?.group === action.group ? null : state.sort,
        sectionSubgroups: { ...state.sectionSubgroups, [action.group]: options[(index + 1) % options.length][0] } };
    }
    case 'sort': {
      const { key, group } = action.column;
      const direction = state.sort?.key === key ? (state.sort.direction === 'asc' ? 'desc' : 'asc') : key === 'player' ? 'asc' : 'desc';
      return { ...state, sort: { key, group: group || null, direction } };
    }
    default: return state;
  }
}
