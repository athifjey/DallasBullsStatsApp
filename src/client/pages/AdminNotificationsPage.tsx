import React, { useEffect, useState } from 'react';

interface VersionMetadata {
	pushApiUrl?: string;
}

const DEFAULT_DEEP_LINK = 'https://athifjey.github.io/DallasBullsStatsApp/#/dashboard';

export const AdminNotificationsPage: React.FC = () => {
	const [pushApiUrl, setPushApiUrl] = useState<string | null>(null);
	const [password, setPassword] = useState('');
	const [sessionToken, setSessionToken] = useState<string | null>(null);
	const [authError, setAuthError] = useState<string | null>(null);
	const [systemMessage, setSystemMessage] = useState('');
	const [pushMessage, setPushMessage] = useState('');
	const [isSendingSystem, setIsSendingSystem] = useState(false);
	const [isSendingPush, setIsSendingPush] = useState(false);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);

	useEffect(() => {
		fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' })
			.then(response => response.json())
			.then((metadata: VersionMetadata) => {
				if (typeof metadata.pushApiUrl === 'string' && metadata.pushApiUrl.trim()) {
					setPushApiUrl(metadata.pushApiUrl.replace(/\/$/, ''));
				}
			})
			.catch(() => {
				setPushApiUrl(null);
			});
	}, []);

	const authenticate = async () => {
		if (!pushApiUrl) {
			setAuthError('Push API URL not configured in this deployment.');
			return;
		}

		setAuthError(null);
		setStatusMessage(null);

		const response = await fetch(`${pushApiUrl}/api/admin/auth`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ password }),
		});

		if (!response.ok) {
			setSessionToken(null);
			setAuthError('Invalid admin password.');
			return;
		}

		const json = await response.json() as { sessionToken?: string };
		if (!json.sessionToken) {
			setSessionToken(null);
			setAuthError('Authentication failed.');
			return;
		}

		setSessionToken(json.sessionToken);
		setPassword('');
		setAuthError(null);
		setStatusMessage('Admin authentication successful.');
	};

	const sendNotification = async (mode: 'system' | 'push', body: string) => {
		if (!sessionToken || !pushApiUrl || !body.trim()) {
			return;
		}

		const endpoint = mode === 'system' ? '/api/admin/send-system' : '/api/admin/send-push';

		if (mode === 'system') {
			setIsSendingSystem(true);
		} else {
			setIsSendingPush(true);
		}
		setStatusMessage(null);

		try {
			const response = await fetch(`${pushApiUrl}${endpoint}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-admin-session': sessionToken,
				},
				body: JSON.stringify({
					body,
					url: DEFAULT_DEEP_LINK,
				}),
			});

			if (response.status === 401) {
				setSessionToken(null);
				setStatusMessage('Session expired. Authenticate again.');
				return;
			}

			if (!response.ok) {
				setStatusMessage('Failed to send notification.');
				return;
			}

			const result = await response.json() as { sent?: number; failed?: number };
			setStatusMessage(`Sent: ${result.sent ?? 0}, Failed: ${result.failed ?? 0}`);

			if (mode === 'system') {
				setSystemMessage('');
			} else {
				setPushMessage('');
			}
		} catch {
			setStatusMessage('Failed to send notification.');
		} finally {
			if (mode === 'system') {
				setIsSendingSystem(false);
			} else {
				setIsSendingPush(false);
			}
		}
	};

	return (
		<div className="page">
			<div className="page__header">
				<h2 className="page__title">Admin Notifications</h2>
				<p className="page__description">Authenticate to send system and push notifications.</p>
			</div>

			{!pushApiUrl && (
				<div className="page__state page__state--error">
					Push API URL is missing in deployment metadata.
				</div>
			)}

			{pushApiUrl && !sessionToken && (
				<div className="admin-panel">
					<label className="admin-panel__label" htmlFor="admin-password">Admin Password</label>
					<input
						id="admin-password"
						type="password"
						className="admin-panel__input"
						value={password}
						onChange={event => setPassword(event.target.value)}
						placeholder="Enter admin password"
					/>
					<button
						type="button"
						className="admin-panel__btn"
						onClick={() => {
							void authenticate();
						}}
					>
						Authenticate
					</button>
					{authError && <p className="admin-panel__error">{authError}</p>}
				</div>
			)}

			{pushApiUrl && sessionToken && (
				<div className="admin-panel">
					<div className="admin-panel__section">
						<h3 className="admin-panel__section-title">System Notification</h3>
						<textarea
							className="admin-panel__textarea"
							value={systemMessage}
							onChange={event => setSystemMessage(event.target.value)}
							placeholder="Type system notification text"
						/>
						<button
							type="button"
							className="admin-panel__btn"
							disabled={!systemMessage.trim() || isSendingSystem}
							onClick={() => {
								void sendNotification('system', systemMessage);
							}}
						>
							{isSendingSystem ? 'Sending...' : 'Send System Notification'}
						</button>
					</div>

					<div className="admin-panel__section">
						<h3 className="admin-panel__section-title">Push Notification</h3>
						<textarea
							className="admin-panel__textarea"
							value={pushMessage}
							onChange={event => setPushMessage(event.target.value)}
							placeholder="Type push notification text"
						/>
						<button
							type="button"
							className="admin-panel__btn"
							disabled={!pushMessage.trim() || isSendingPush}
							onClick={() => {
								void sendNotification('push', pushMessage);
							}}
						>
							{isSendingPush ? 'Sending...' : 'Send Push Notification'}
						</button>
					</div>

					{statusMessage && <p className="admin-panel__status">{statusMessage}</p>}
				</div>
			)}
		</div>
	);
};
