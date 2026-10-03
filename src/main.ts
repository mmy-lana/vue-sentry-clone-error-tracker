import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './assets/main.css';
import { seedInitialErrors } from './services/seeder';

const app = createApp(App);

app.use(createPinia());
app.use(router);

async function bootstrap(): Promise<void> {
  try {
    await router.isReady();
    await seedInitialErrors();
  } catch (error) {
    console.error('[tracker] bootstrap failed', error);
  } finally {
    app.mount('#app');
  }
}

void bootstrap();