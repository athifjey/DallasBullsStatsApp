import React, { useState } from 'react';
import { Header, Page } from './Header';
import { BattingSummaryPage } from './pages/BattingSummaryPage';
import { PlayerListPage } from './pages/PlayerListPage';
import { BowlingSummaryPage } from './pages/BowlingSummaryPage';
import { BattingHistoryPage } from './pages/BattingHistoryPage';
import { BowlingHistoryPage } from './pages/BowlingHistoryPage';

const PAGE_MAP: Record<Page, React.FC> = {
	'batting-summary': BattingSummaryPage,
	'player-list': PlayerListPage,
	'bowling-summary': BowlingSummaryPage,
	'batting-history': BattingHistoryPage,
	'bowling-history': BowlingHistoryPage,
};

export const App: React.FC = () => {
	const [activePage, setActivePage] = useState<Page>('batting-summary');
	const PageComponent = PAGE_MAP[activePage];

	return (
		<div className="app">
			<Header activePage={activePage} onNavigate={setActivePage} />
			<main className="app-content">
				<PageComponent />
			</main>
		</div>
	);
};