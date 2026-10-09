import { createApp, h, reactive, shallowRef } from 'vue';
import SessionPage from './pages/SessionPage.vue';

// The routing/data controller remains framework-independent during migration.
// Vue owns everything inside #sessionApp; legacy code never edits that DOM.
window.NickStatsSessionUI = {
  create({ onRetry }) {
    const status = reactive({ loading: false, error: '', ready: false });
    const model = shallowRef(null);
    const comparison = window.NickStatsQuickComparison.create({
      prefix: 'session', onUpdate: value => { model.value = value; }
    });
    createApp({ setup: () => () => h(SessionPage, { status, model: model.value, onRetry }) }).mount('#sessionApp');
    return {
      loading() { status.loading = true; status.error = ''; status.ready = false; model.value = null; },
      error(message) { status.loading = false; status.error = message; status.ready = false; },
      render(input) { comparison.render(input); status.loading = false; status.error = ''; status.ready = true; }
    };
  }
};
