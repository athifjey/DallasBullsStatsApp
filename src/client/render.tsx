import React from 'react';
import type { RendererContext } from 'vscode-notebook-renderer';
import { App } from './App';

interface IRenderInfo {
	container: HTMLElement;
	mime: string;
	value: unknown;
	context: RendererContext<unknown>;
}

export const IssuesList: React.FC<{ info: IRenderInfo }> = () => {
	return <App />;
};

if (module.hot) {
	module.hot.addDisposeHandler(() => {
		// In development, this will be called before the renderer is reloaded. You
		// can use this to clean up or stash any state.
	});
}
