import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './assets/main.css';
import { seedInitialErrors } from './services/seeder';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

seedInitialErrors().catch(console.error);

app.mount('#app');
