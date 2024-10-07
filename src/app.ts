import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

app.use(
	'/api/*',
	cors({
		credentials: true,
		origin: '*',
	})
);

export default app;
