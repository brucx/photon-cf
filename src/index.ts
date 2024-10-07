import { fromHono } from 'chanfana';
import { cache } from 'hono/cache';

import app from './app';
import { PhotonTransform } from './endpoints';

export const options = {
	docs_url: '/docs',
	schema: {
		info: {
			title: 'A1d Image Transform Worker API',
			version: '1.0',
		}
	},
};

const openapi = fromHono(app, options);

openapi.get(
	'/api/transform',
	cache({
		cacheName: 'a1d-photon-output-img',
		cacheControl: 'max-age=15552000',
	}),
	PhotonTransform
);

export default {
	fetch: app.fetch
};