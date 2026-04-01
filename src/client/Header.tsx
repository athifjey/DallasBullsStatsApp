import React, { useEffect, useState } from 'react';

export type Page = 'dashboard' | 'team-stats' | 'batting-summary' | 'player-list' | 'bowling-summary' | 'batting-history' | 'bowling-history';

interface HeaderProps {
	activePage: Page;
	onNavigate: (page: Page) => void;
}

interface NavItem {
	id: Page;
	label: string;
	tag?: string;
	featured?: boolean;
}

const NAV_ITEMS: NavItem[] = [
	{ id: 'dashboard', label: 'Dashboard' },
	{ id: 'team-stats', label: 'Team Stats', tag: 'New', featured: true },
	{ id: 'batting-summary', label: 'Batting Summary' },
	{ id: 'bowling-summary', label: 'Bowling Summary' },
	{ id: 'batting-history', label: 'Batting History' },
	{ id: 'bowling-history', label: 'Bowling History' },
	{ id: 'player-list', label: 'Player List' },
];

export const Header: React.FC<HeaderProps> = ({ activePage, onNavigate }) => {
	const [isSideNavOpen, setIsSideNavOpen] = useState(false);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setIsSideNavOpen(false);
			}
		};

		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, []);

	const handleNavigate = (page: Page) => {
		onNavigate(page);
		setIsSideNavOpen(false);
	};

	return (
		<>
			<header className="app-header">
				<div className="app-header__top-row">
					<button
						type="button"
						className="app-header__menu-btn"
						onClick={() => setIsSideNavOpen(true)}
						aria-label="Open menu"
					>
						Menu
					</button>

					<div className="app-header__brand">
						<img src="./assets/logo.png" alt="Dallas Bulls" className="app-header__logo" />
						<span className="app-header__title">Dallas Bulls Stats</span>
					</div>

					<div className="app-header__menu-spacer" />
				</div>

				<nav className="app-nav app-nav--desktop">
					{NAV_ITEMS.map(item => (
						<button
							key={item.id}
							className={`app-nav__item${item.featured ? ' app-nav__item--featured' : ''}${activePage === item.id ? ' app-nav__item--active' : ''}`}
							onClick={() => handleNavigate(item.id)}
						>
							<span>{item.label}</span>
							{item.tag && <span className="app-nav__tag">{item.tag}</span>}
						</button>
					))}
				</nav>
			</header>

			{isSideNavOpen && (
				<button
					type="button"
					className="app-side-nav__backdrop"
					onClick={() => setIsSideNavOpen(false)}
					aria-label="Close menu"
				/>
			)}

			<aside className={`app-side-nav${isSideNavOpen ? ' app-side-nav--open' : ''}`}>
				<div className="app-side-nav__header">
					<span className="app-side-nav__title">Menu</span>
					<button
						type="button"
						className="app-side-nav__close"
						onClick={() => setIsSideNavOpen(false)}
					>
						Close
					</button>
				</div>

				<nav className="app-side-nav__list">
					{NAV_ITEMS.map(item => (
						<button
							type="button"
							key={item.id}
							className={`app-side-nav__item${item.featured ? ' app-side-nav__item--featured' : ''}${activePage === item.id ? ' app-side-nav__item--active' : ''}`}
							onClick={() => handleNavigate(item.id)}
						>
							<span>{item.label}</span>
							{item.tag && <span className="app-nav__tag app-nav__tag--side">{item.tag}</span>}
						</button>
					))}
				</nav>
			</aside>
		</>
	);
};
