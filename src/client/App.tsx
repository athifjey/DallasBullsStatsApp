import React, { useEffect, useState } from 'react';
import { Header, Page } from './Header';
import { DashboardPage } from './pages/DashboardPage';
import { TeamStatsPage } from './pages/TeamStatsPage';
import { BattingSummaryPage } from './pages/BattingSummaryPage';
import { PlayerListPage } from './pages/PlayerListPage';
import { BowlingSummaryPage } from './pages/BowlingSummaryPage';
import { BattingHistoryPage } from './pages/BattingHistoryPage';
import { BowlingHistoryPage } from './pages/BowlingHistoryPage';

const VERSION_POLL_MS = 5 * 60 * 1000;

interface VersionMetadata {
	appVersion: string;
	buildId: string;
	commitSha: string;
	buildTimeUtc: string;
	message?: string;
}

const PAGE_ROUTES: Record<Page, string> = {
	'dashboard': 'dashboard',
	'team-stats': 'team-stats',
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
	'team-stats': TeamStatsPage,
	'batting-summary': BattingSummaryPage,
	'bowling-summary': BowlingSummaryPage,
	'batting-history': BattingHistoryPage,
	'bowling-history': BowlingHistoryPage,
    'player-list': PlayerListPage,
};

export const App: React.FC = () => {
	const [activePage, setActivePage] = useState<Page>(getPageFromHash);
	const [knownBuildId, setKnownBuildId] = useState<string | null>(null);
	const [availableUpdate, setAvailableUpdate] = useState<VersionMetadata | null>(null);
	const [notificationSentForBuild, setNotificationSentForBuild] = useState<string | null>(null);

	const parseVersionMetadata = (value: unknown): VersionMetadata | null => {
		if (!value || typeof value !== 'object') {
			return null;
		}

		const data = value as Record<string, unknown>;
		if (typeof data.buildId !== 'string' || typeof data.appVersion !== 'string') {
			return null;
		}

		return {
			appVersion: data.appVersion,
			buildId: data.buildId,
			commitSha: typeof data.commitSha === 'string' ? data.commitSha : 'unknown',
			buildTimeUtc: typeof data.buildTimeUtc === 'string' ? data.buildTimeUtc : '',
			message: typeof data.message === 'string' ? data.message : undefined,
		};
	};

	const maybeNotifyForUpdate = async (metadata: VersionMetadata) => {
		if (notificationSentForBuild === metadata.buildId || typeof window === 'undefined' || !('Notification' in window)) {
			return;
		}

		if (Notification.permission === 'default') {
			try {
				await Notification.requestPermission();
			} catch {
				return;
			}
		}

		if (Notification.permission !== 'granted') {
			return;
		}

		const title = 'Dallas Bulls Stats update available';
		const body = metadata.message ?? `Version ${metadata.appVersion} is ready.`;

		try {
			if ('serviceWorker' in navigator) {
				const registration = await navigator.serviceWorker.getRegistration();
				if (registration) {
					await registration.showNotification(title, {
						body,
						icon: './assets/logo.png',
						tag: `update-${metadata.buildId}`,
						renotify: false,
					});
					setNotificationSentForBuild(metadata.buildId);
					return;
				}
			}

			new Notification(title, { body, icon: './assets/logo.png' });
			setNotificationSentForBuild(metadata.buildId);
		} catch {
			// Ignore notification errors; banner still informs users.
		}
	};

	const checkForVersionUpdate = async () => {
		try {
			const response = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
			if (!response.ok) {
				return;
			}

			const json = await response.json();
			const metadata = parseVersionMetadata(json);
			if (!metadata) {
				return;
			}

			if (!knownBuildId) {
				setKnownBuildId(metadata.buildId);
				return;
			}

			if (knownBuildId !== metadata.buildId) {
				setAvailableUpdate(metadata);
				await maybeNotifyForUpdate(metadata);
			}
		} catch {
			// Ignore polling failures and retry on next interval.
		}
	};

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

	useEffect(() => {
		void checkForVersionUpdate();

		const intervalId = window.setInterval(() => {
			void checkForVersionUpdate();
		}, VERSION_POLL_MS);

		const onVisibilityChange = () => {
			if (document.visibilityState === 'visible') {
				void checkForVersionUpdate();
			}
		};

		document.addEventListener('visibilitychange', onVisibilityChange);

		return () => {
			window.clearInterval(intervalId);
			document.removeEventListener('visibilitychange', onVisibilityChange);
		};
	}, [knownBuildId, notificationSentForBuild]);

	const handleNavigate = (page: Page) => {
		setActivePage(page);
		window.location.hash = `/${PAGE_ROUTES[page]}`;
	};

	const PageComponent = PAGE_MAP[activePage];

	return (
		<div className="app">
			{availableUpdate && (
				<div className="update-banner" role="status" aria-live="polite">
					<div className="update-banner__body">
						<strong className="update-banner__title">New version available</strong>
						<span className="update-banner__text">
							{availableUpdate.message ?? `Version ${availableUpdate.appVersion} is now available.`}
						</span>
					</div>
					<div className="update-banner__actions">
						<button type="button" className="update-banner__btn" onClick={() => window.location.reload()}>
							Refresh
						</button>
						<button
							type="button"
							className="update-banner__btn update-banner__btn--ghost"
							onClick={() => setAvailableUpdate(null)}
						>
							Dismiss
						</button>
					</div>
				</div>
			)}
			<Header activePage={activePage} onNavigate={handleNavigate} />
			<main className="app-content">
				<PageComponent />
			</main>
		</div>
	);
};