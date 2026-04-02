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
const LAST_SEEN_BUILD_KEY = 'dallas-bulls:last-seen-build';
const LAST_NOTIFIED_BUILD_KEY = 'dallas-bulls:last-notified-build';

interface VersionMetadata {
	appVersion: string;
	buildId: string;
	commitSha: string;
	buildTimeUtc: string;
	message?: string;
	pushApiUrl?: string;
	pushVapidPublicKey?: string;
}

interface PushConfig {
	apiUrl: string;
	vapidPublicKey: string;
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
	const [pushConfig, setPushConfig] = useState<PushConfig | null>(null);
	const [isPushSubscribed, setIsPushSubscribed] = useState(false);
	const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
		if (typeof window === 'undefined' || !('Notification' in window)) {
			return 'default';
		}

		return Notification.permission;
	});
	const [knownBuildId, setKnownBuildId] = useState<string | null>(() => {
		if (typeof window === 'undefined') {
			return null;
		}
		return window.localStorage.getItem(LAST_SEEN_BUILD_KEY);
	});
	const [availableUpdate, setAvailableUpdate] = useState<VersionMetadata | null>(null);
	const [notificationSentForBuild, setNotificationSentForBuild] = useState<string | null>(() => {
		if (typeof window === 'undefined') {
			return null;
		}
		return window.localStorage.getItem(LAST_NOTIFIED_BUILD_KEY);
	});

	const persistKnownBuildId = (buildId: string) => {
		setKnownBuildId(buildId);
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(LAST_SEEN_BUILD_KEY, buildId);
		}
	};

	const persistNotifiedBuildId = (buildId: string) => {
		setNotificationSentForBuild(buildId);
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(LAST_NOTIFIED_BUILD_KEY, buildId);
		}
	};

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
			pushApiUrl: typeof data.pushApiUrl === 'string' ? data.pushApiUrl : undefined,
			pushVapidPublicKey: typeof data.pushVapidPublicKey === 'string' ? data.pushVapidPublicKey : undefined,
		};
	};

	const toUint8Array = (base64: string): Uint8Array => {
		const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`
			.replace(/-/g, '+')
			.replace(/_/g, '/');
		const raw = window.atob(padded);
		const output = new Uint8Array(raw.length);
		for (let index = 0; index < raw.length; index += 1) {
			output[index] = raw.charCodeAt(index);
		}
		return output;
	};

	const subscribeForPush = async (requestPermission: boolean): Promise<boolean> => {
		if (!pushConfig || typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
			return false;
		}

		if (notificationPermission === 'denied') {
			return false;
		}

		let permission: NotificationPermission = notificationPermission;
		if (permission !== 'granted' && requestPermission && 'Notification' in window) {
			permission = await Notification.requestPermission();
			setNotificationPermission(permission);
		}

		if (permission !== 'granted') {
			return false;
		}

		const registration = await navigator.serviceWorker.ready;
		let subscription = await registration.pushManager.getSubscription();

		if (!subscription) {
			subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: toUint8Array(pushConfig.vapidPublicKey) as unknown as BufferSource,
			});
		}

		const response = await fetch(`${pushConfig.apiUrl}/api/push/subscribe`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ subscription }),
		});

		if (!response.ok) {
			return false;
		}

		setIsPushSubscribed(true);
		return true;
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
					});
					persistNotifiedBuildId(metadata.buildId);
					return;
				}
			}

			new Notification(title, { body, icon: './assets/logo.png' });
			persistNotifiedBuildId(metadata.buildId);
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

			if (metadata.pushApiUrl && metadata.pushVapidPublicKey) {
				setPushConfig({
					apiUrl: metadata.pushApiUrl.replace(/\/$/, ''),
					vapidPublicKey: metadata.pushVapidPublicKey,
				});
			}

			if (!knownBuildId) {
				persistKnownBuildId(metadata.buildId);
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
		if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
			return;
		}

		navigator.serviceWorker.ready
			.then(registration => registration.pushManager.getSubscription())
			.then(subscription => {
				setIsPushSubscribed(Boolean(subscription));
			})
			.catch(() => {
				setIsPushSubscribed(false);
			});
	}, []);

	useEffect(() => {
		if (!pushConfig) {
			return;
		}

		void subscribeForPush(false);
	}, [pushConfig, notificationPermission]);

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
			{pushConfig && !isPushSubscribed && notificationPermission !== 'denied' && (
				<div className="update-banner" role="status" aria-live="polite">
					<div className="update-banner__body">
						<strong className="update-banner__title">Enable System Alerts</strong>
						<span className="update-banner__text">
							Allow notifications to receive push updates even when the app is in background.
						</span>
					</div>
					<div className="update-banner__actions">
						<button
							type="button"
							className="update-banner__btn"
							onClick={() => {
								void subscribeForPush(true);
							}}
						>
							Enable
						</button>
					</div>
				</div>
			)}

			{availableUpdate && (
				<div className="update-banner" role="status" aria-live="polite">
					<div className="update-banner__body">
						<strong className="update-banner__title">New version available</strong>
						<span className="update-banner__text">
							{availableUpdate.message ?? `Version ${availableUpdate.appVersion} is now available.`}
						</span>
					</div>
					<div className="update-banner__actions">
						<button
							type="button"
							className="update-banner__btn"
							onClick={() => {
								persistKnownBuildId(availableUpdate.buildId);
								window.location.reload();
							}}
						>
							Refresh
						</button>
						<button
							type="button"
							className="update-banner__btn update-banner__btn--ghost"
							onClick={() => {
								persistKnownBuildId(availableUpdate.buildId);
								setAvailableUpdate(null);
							}}
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