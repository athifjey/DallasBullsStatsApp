import React, { useEffect, useMemo, useState } from 'react';
import { fetchSheetData, SheetRow } from '../sheetsApi';

const resolvePlayerNameKey = (rows: SheetRow[]): string | null => {
	if (!rows.length) {
		return null;
	}

	const keys = Object.keys(rows[0]);
	const exact = keys.find(key => key.trim().toLowerCase() === 'player name');
	if (exact) {
		return exact;
	}

	const fallback = keys.find(key => key.trim().toLowerCase().includes('player'));
	return fallback ?? null;
};

export const BowlingHistoryPage: React.FC = () => {
	const [rows, setRows] = useState<SheetRow[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState('');

	useEffect(() => {
		setLoading(true);
		setError(null);

		fetchSheetData('Bowling History')
			.then(data => {
				setRows(data);
				setLoading(false);
			})
			.catch((err: Error) => {
				setError(err.message);
				setLoading(false);
			});
	}, []);

	const playerNameKey = useMemo(() => resolvePlayerNameKey(rows), [rows]);

	const uniquePlayers = useMemo(() => {
		if (!playerNameKey) {
			return [];
		}

		const unique = new Set<string>();
		for (const row of rows) {
			const name = (row[playerNameKey] ?? '').trim();
			if (name) {
				unique.add(name);
			}
		}

		return Array.from(unique).sort((a, b) => a.localeCompare(b));
	}, [rows, playerNameKey]);

	const selectedPlayerRows = useMemo(() => {
		if (!selectedPlayer || !playerNameKey) {
			return [];
		}

		return rows.filter(row => (row[playerNameKey] ?? '').trim() === selectedPlayer);
	}, [rows, selectedPlayer, playerNameKey]);

	const modalHeaders = useMemo(
		() => (selectedPlayerRows.length ? Object.keys(selectedPlayerRows[0]) : []),
		[selectedPlayerRows]
	);

	const filteredPlayers = useMemo(() => {
		const normalizedQuery = searchQuery.trim().toLowerCase();
		if (!normalizedQuery) {
			return uniquePlayers;
		}

		return uniquePlayers.filter(player => player.toLowerCase().includes(normalizedQuery));
	}, [uniquePlayers, searchQuery]);

	return (
		<div className="page">
			<div className="page__header">
				<h2 className="page__title">Bowling History</h2>
				<p className="page__description">Select a player to view all of their bowling history records.</p>
			</div>

			{loading && (
				<div className="page__state">
					<div className="spinner" />
					<span>Loading Bowling History...</span>
				</div>
			)}

			{error && <div className="page__state page__state--error">{error}</div>}

			{!loading && !error && !playerNameKey && (
				<div className="page__state page__state--error">
					Could not find a player name column in the Bowling History sheet.
				</div>
			)}

			{!loading && !error && playerNameKey && uniquePlayers.length === 0 && (
				<div className="page__state">No player data found in Bowling History.</div>
			)}

			{!loading && !error && uniquePlayers.length > 0 && (
				<>
					<div className="player-search-wrap">
						<input
							type="text"
							className="player-search-input"
							value={searchQuery}
							onChange={event => setSearchQuery(event.target.value)}
							placeholder="Search player name..."
							aria-label="Search player names"
						/>
						<div className="player-search-meta">
							Showing {filteredPlayers.length} of {uniquePlayers.length} players
						</div>
					</div>

					{filteredPlayers.length === 0 ? (
						<div className="page__state">No players match your search.</div>
					) : (
						<div className="player-list-grid">
							{filteredPlayers.map(player => (
								<button
									type="button"
									key={player}
									className="player-chip"
									onClick={() => setSelectedPlayer(player)}
								>
									{player}
								</button>
							))}
						</div>
					)}
				</>
			)}

			{selectedPlayer && (
				<div className="modal-backdrop" onClick={() => setSelectedPlayer(null)}>
					<div className="modal-card" onClick={event => event.stopPropagation()}>
						<div className="modal-card__header">
							<h3 className="modal-card__title">{selectedPlayer} - Bowling History</h3>
							<button
								type="button"
								className="modal-card__close"
								onClick={() => setSelectedPlayer(null)}
							>
								Close
							</button>
						</div>

						<div className="table-wrapper">
							<table className="data-table">
								<thead>
									<tr>
										{modalHeaders.map(header => (
											<th key={header}>{header}</th>
										))}
									</tr>
								</thead>
								<tbody>
									{selectedPlayerRows.map((row, index) => (
										<tr key={`${selectedPlayer}-${index}`} className={index % 2 === 0 ? 'row-even' : 'row-odd'}>
											{modalHeaders.map(header => (
												<td key={header}>{row[header]}</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
