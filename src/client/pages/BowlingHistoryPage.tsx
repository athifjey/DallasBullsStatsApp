import React, { useEffect, useMemo, useState } from 'react';
import { fetchSheetData, SheetRow } from '../sheetsApi';

const resolvePlayerNameKey = (rows: SheetRow[]): string | null => {
	if (!rows.length) return null;
	const keys = Object.keys(rows[0]);
	const exact = keys.find(key => key.trim().toLowerCase() === 'player name');
	if (exact) return exact;
	return keys.find(key => key.trim().toLowerCase().includes('player')) ?? null;
};

const findCol = (headers: string[], patterns: RegExp[]): string | undefined => {
	for (const pat of patterns) {
		const match = headers.find(h => pat.test(h.trim()));
		if (match) return match;
	}
	return undefined;
};

const parseNum = (val: string | undefined) => {
	const n = parseFloat((val ?? '').trim());
	return isNaN(n) ? 0 : n;
};

interface BowlingRecentPerf {
	matches: number;
	totalWickets: number | null;
	totalRunsConceded: number | null;
	totalOvers: number | null;
	totalMaidens: number | null;
	economy: string | null;
	bestFigures: string | null;
}

const computeBowlingRecentPerf = (rows: SheetRow[]): BowlingRecentPerf | null => {
	const last5 = rows.slice(-5);
	if (!last5.length) return null;
	const headers = Object.keys(last5[0]);

	const wicketsCol  = findCol(headers, [/^wkts?$/i, /^wickets?$/i, /^w$/i]);
	const runsCol     = findCol(headers, [/^runs?\s*conceded$/i, /^runs?$/i, /^r$/i, /^rc$/i]);
	const oversCol    = findCol(headers, [/^overs?$/i, /^o$/i]);
	const maidensCol  = findCol(headers, [/^maidens?$/i, /^m$/i]);
	const figuresCol  = findCol(headers, [/^figures?$/i, /^best$/i, /^bbm?$/i]);

	const totalWickets      = wicketsCol ? last5.reduce((s, r) => s + parseNum(r[wicketsCol]), 0) : null;
	const totalRunsConceded = runsCol    ? last5.reduce((s, r) => s + parseNum(r[runsCol]),    0) : null;
	const totalOvers        = oversCol   ? last5.reduce((s, r) => s + parseNum(r[oversCol]),   0) : null;
	const totalMaidens      = maidensCol ? last5.reduce((s, r) => s + parseNum(r[maidensCol]), 0) : null;

	const economy = totalRunsConceded !== null && totalOvers !== null && totalOvers > 0
		? (totalRunsConceded / totalOvers).toFixed(2)
		: null;

	let bestFigures: string | null = null;
	if (figuresCol) {
		bestFigures = last5
			.map(r => r[figuresCol] ?? '')
			.filter(Boolean)
			.sort((a, b) => {
				const [aw, ar] = a.split('/').map(Number);
				const [bw, br] = b.split('/').map(Number);
				if (bw !== aw) return (bw || 0) - (aw || 0);
				return (ar || 0) - (br || 0);
			})[0] ?? null;
	} else if (wicketsCol && runsCol) {
		bestFigures = last5
			.map(r => ({ w: parseNum(r[wicketsCol!]), r: parseNum(r[runsCol!]) }))
			.sort((a, b) => b.w !== a.w ? b.w - a.w : a.r - b.r)
			.map(x => `${x.w}/${x.r}`)[0] ?? null;
	}

	return { matches: last5.length, totalWickets, totalRunsConceded, totalOvers, totalMaidens, economy, bestFigures };
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
		if (!playerNameKey) return [];
		const unique = new Set<string>();
		for (const row of rows) {
			const name = (row[playerNameKey] ?? '').trim();
			if (name) unique.add(name);
		}
		return Array.from(unique).sort((a, b) => a.localeCompare(b));
	}, [rows, playerNameKey]);

	const selectedPlayerRows = useMemo(() => {
		if (!selectedPlayer || !playerNameKey) return [];
		const filtered = rows.filter(row => (row[playerNameKey] ?? '').trim() === selectedPlayer);
		const dateCol = filtered.length
			? Object.keys(filtered[0]).find(h => /date/i.test(h))
			: undefined;
		if (dateCol) {
			return [...filtered].sort((a, b) => {
				const da = new Date(a[dateCol] ?? '').getTime();
				const db = new Date(b[dateCol] ?? '').getTime();
				return (isNaN(db) ? 0 : db) - (isNaN(da) ? 0 : da);
			});
		}
		return filtered;
	}, [rows, selectedPlayer, playerNameKey]);

	const modalHeaders = useMemo(() => {
		if (!selectedPlayerRows.length) return [];
		return Object.keys(selectedPlayerRows[0]).filter(h => h !== playerNameKey);
	}, [selectedPlayerRows, playerNameKey]);

	const recentPerf = useMemo(() => computeBowlingRecentPerf(selectedPlayerRows), [selectedPlayerRows]);

	const filteredPlayers = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return uniquePlayers;
		return uniquePlayers.filter(p => p.toLowerCase().includes(q));
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

						{recentPerf && (
							<div className="recent-perf-card">
								<div className="recent-perf-card__header">
									<span className="recent-perf-card__player">{selectedPlayer}</span>
									<span className="recent-perf-card__label">Recent Performance (Last {recentPerf.matches} Matches)</span>
								</div>
								<div className="recent-perf-stats">
									{recentPerf.totalWickets !== null && (
										<div className="recent-perf-stat">
											<span className="recent-perf-stat__val">{recentPerf.totalWickets}</span>
											<span className="recent-perf-stat__lbl">Wickets</span>
										</div>
									)}
									{recentPerf.totalRunsConceded !== null && (
										<div className="recent-perf-stat">
											<span className="recent-perf-stat__val">{recentPerf.totalRunsConceded}</span>
											<span className="recent-perf-stat__lbl">Runs Conceded</span>
										</div>
									)}
									{recentPerf.totalOvers !== null && (
										<div className="recent-perf-stat">
											<span className="recent-perf-stat__val">{recentPerf.totalOvers}</span>
											<span className="recent-perf-stat__lbl">Overs</span>
										</div>
									)}
									{recentPerf.totalMaidens !== null && (
										<div className="recent-perf-stat">
											<span className="recent-perf-stat__val">{recentPerf.totalMaidens}</span>
											<span className="recent-perf-stat__lbl">Maidens</span>
										</div>
									)}
									{recentPerf.economy !== null && (
										<div className="recent-perf-stat">
											<span className="recent-perf-stat__val">{recentPerf.economy}</span>
											<span className="recent-perf-stat__lbl">Economy</span>
										</div>
									)}
									{recentPerf.bestFigures !== null && (
										<div className="recent-perf-stat">
											<span className="recent-perf-stat__val">{recentPerf.bestFigures}</span>
											<span className="recent-perf-stat__lbl">Best Figures</span>
										</div>
									)}
								</div>
							</div>
						)}

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
