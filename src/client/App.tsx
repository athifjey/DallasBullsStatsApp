import React, { useEffect, useState } from 'react';
import { Header, Page } from './Header';
import { DashboardPage } from './pages/DashboardPage';
import { BattingSummaryPage } from './pages/BattingSummaryPage';
import { PlayerListPage } from './pages/PlayerListPage';
import { BowlingSummaryPage } from './pages/BowlingSummaryPage';
import { BattingHistoryPage } from './pages/BattingHistoryPage';
import { BowlingHistoryPage } from './pages/BowlingHistoryPage';

const PAGE_ROUTES: Record<Page, string> = {
	'dashboard': 'dashboard',
	'batting-summary': 'batting-summary',
	'player-list': 'player-list',
	'bowling-summary': 'bowling-summary',
	'batting-history': 'batting-history',
	'bowling-history': 'bowling-history',
};

const isPage = (value: string): value is Page => {
	return value in PAGE_MAP;
};

const getPageFromHash = (): Page => {
	if (typeof window === 'undefined') {
		return 'dashboard';
	}

	const normalized = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
	if (isPage(normalized)) {
		return normalized;
	}

	return 'dashboard';
};

const PAGE_MAP: Record<Page, React.FC> = {
	'dashboard': DashboardPage,
	'batting-summary': BattingSummaryPage,
	'bowling-summary': BowlingSummaryPage,
	'batting-history': BattingHistoryPage,
	'bowling-history': BowlingHistoryPage,
    'player-list': PlayerListPage,
};

export const App: React.FC = () => {
	const [activePage, setActivePage] = useState<Page>(getPageFromHash);

	useEffect(() => {
		const onHashChange = () => {
			setActivePage(getPageFromHash());
		};

		window.addEventListener('hashchange', onHashChange);

		if (!window.location.hash) {
			window.location.hash = `/${PAGE_ROUTES.dashboard}`;
		}

		return () => {
			window.removeEventListener('hashchange', onHashChange);
		};
	}, []);

	const handleNavigate = (page: Page) => {
		setActivePage(page);
		window.location.hash = `/${PAGE_ROUTES[page]}`;
	};

	const PageComponent = PAGE_MAP[activePage];

	return (
		<div className="app">
			<Header activePage={activePage} onNavigate={handleNavigate} />
			<main className="app-content">
				<PageComponent />
			</main>
		</div>
	);
};