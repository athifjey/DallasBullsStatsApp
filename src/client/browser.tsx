import React from 'react';
import ReactDOM from 'react-dom';
import './style.css';
import { App } from './App';

const registerServiceWorker = (): void => {
	if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
		return;
	}

	window.addEventListener('load', () => {
		navigator.serviceWorker.register('./sw.js').then(registration => {
			registration.update().catch(() => {});

			if (registration.waiting) {
				registration.waiting.postMessage({ type: 'SKIP_WAITING' });
			}

			registration.addEventListener('updatefound', () => {
				const newWorker = registration.installing;
				if (!newWorker) {
					return;
				}

				newWorker.addEventListener('statechange', () => {
					if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
						newWorker.postMessage({ type: 'SKIP_WAITING' });
					}
				});
			});

			let refreshing = false;
			navigator.serviceWorker.addEventListener('controllerchange', () => {
				if (refreshing) {
					return;
				}
				refreshing = true;
				window.location.reload();
			});
		}).catch(() => {});
	});
};

const root = document.getElementById('root');

if (!root) {
	throw new Error('Root element not found');
}

registerServiceWorker();

ReactDOM.render(<App />, root);