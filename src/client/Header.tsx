import React from 'react';

export type Page = 'batting-summary' | 'player-list' | 'bowling-summary' | 'batting-history' | 'bowling-history';

interface HeaderProps {
	activePage: Page;
	onNavigate: (page: Page) => void;
}

const NAV_ITEMS: { id: Page; label: string }[] = [
	{ id: 'batting-summary', label: 'Batting Summary' },
	{ id: 'player-list', label: 'Player List' },
	{ id: 'bowling-summary', label: 'Bowling Summary' },
	{ id: 'batting-history', label: 'Batting History' },
	{ id: 'bowling-history', label: 'Bowling History' },
];

export const Header: React.FC<HeaderProps> = ({ activePage, onNavigate }) => {
	return (
		<header className="app-header">
			<div className="app-header__brand">
				<span className="app-header__logo">🏏</span>
				<span className="app-header__title">Dallas Bulls Stats</span>
			</div>
			<nav className="app-nav">
				{NAV_ITEMS.map(item => (
					<button
						key={item.id}
						className={`app-nav__item${activePage === item.id ? ' app-nav__item--active' : ''}`}
						onClick={() => onNavigate(item.id)}
					>
						{item.label}
					</button>
				))}
			</nav>
		</header>
	);
};
