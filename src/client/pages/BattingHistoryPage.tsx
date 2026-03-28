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

const findCol = (headers: string[], patterns: RegExp[]): string | undefined => {
	for (const pat of patterns) {
		const match = headers.find(h => pat.test(h.trim()));
		if (match) return match;
	}
	return undefined;
};

const parseNum = (val: string | undefined) => {
	const n = parseFloat((val ?? '').replace(/\*/g, '').trim());
	return isNaN(n) ? 0 : n;
};

interface RecentPerf {
	matches: number;
	totalRuns: number | null;
	totalFours: number | null;
	totalSixes: number | null;
	notOuts: number;
	average: string | null;
	strikeRate: string | null;
}

const computeRecentPerf = (rows: SheetRow[]): RecentPerf | null => {
	const last5 = rows.slice(-5);
	if (!last5.length) return null;

	const headers = Object.keys(last5[0]);

	const runsCol     = findCol(headers, [/^runs?$/i, /^r$/i, /^score$/i, /runs/i]);
	const foursCol    = findCol(headers, [/^4s?$/i, /^fours?$/i]);
	const sixesCol    = findCol(headers, [/^6s?$/i, /^sixes?$/i]);
	const notOutCol   = findCol(headers, [/not[\s_-]?out/i, /^n\/o$/i, /^no$/i]);
	const ballsCol    = findCol(headers, [/^balls?$/i, /^bf$/i]);
	const dismissalCol = findCol(headers, [/dismissal/i, /how[\s_-]?out/i]);

	const totalRuns  = runsCol  ? last5.reduce((s, r) => s + parseNum(r[runsCol]),  0) : null;
	const totalFours = foursCol ? last5.reduce((s, r) => s + parseNum(r[foursCol]), 0) : null;
	const totalSixes = sixesCol ? last5.reduce((s, r) => s + parseNum(r[sixesCol]), 0) : null;
	const totalBalls = ballsCol ? last5.reduce((s, r) => s + parseNum(r[ballsCol]), 0) : null;

	let notOuts = 0;
	if (notOutCol) {
		notOuts = last5.filter(r => {
			const v = (r[notOutCol] ?? '').toLowerCase().trim();
			return v === 'yes' || v === '1' || v === 'true' || v === 'not out' || v === 'n/o';
		}).length;
	} else if (dismissalCol) {
		notOuts = last5.filter(r => (r[dismissalCol] ?? '').toLowerCase().includes('not out')).length;
	} else if (runsCol) {
		notOuts = last5.filter(r => (r[runsCol] ?? '').includes('*')).length;
	}

	const outs = last5.length - notOuts;
	const average = totalRuns !== null
		? (outs > 0 ? (totalRuns / outs).toFixed(2) : 'N/A')
		: null;
	const strikeRate = totalRuns !== null && totalBalls !== null && totalBalls > 0
		? ((totalRuns / totalBalls) * 100).toFixed(2)
		: null;

	return { matches: last5.length, totalRuns, totalFours, totalSixes, notOuts, average, strikeRate };
};

export const BattingHistoryPage: React.FC = () => {
	const [rows, setRows] = useState<SheetRow[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState('');

	useEffect(() => {
		setLoading(true);
		setError(null);

		fetchSheetData('Batting History')
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

		const filtered = rows.filter(row => (row[playerNameKey] ?? '').trim() === selectedPlayer);

		// Sort by date column descending (most recent first)
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

	const recentPerf = useMemo(() => computeRecentPerf(selectedPlayerRows), [selectedPlayerRows]);

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
				<h2 className="page__title">Batting History</h2>
				<p className="page__description">Select a player to view all of their batting history records.</p>
			</div>

			{loading && (
				<div className="page__state">
					<div className="spinner" />
					<span>Loading Batting History...</span>
				</div>
			)}

			{error && <div className="page__state page__state--error">{error}</div>}

			{!loading && !error && !playerNameKey && (
				<div className="page__state page__state--error">
					Could not find a player name column in the Batting History sheet.
				</div>
			)}

			{!loading && !error && playerNameKey && uniquePlayers.length === 0 && (
				<div className="page__state">No player data found in Batting History.</div>
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
							<h3 className="modal-card__title">{selectedPlayer} - Batting History</h3>
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
									{recentPerf.totalRuns !== null && (
										<div className="recent-perf-stat">
											<span className="recent-perf-stat__val">{recentPerf.totalRuns}</span>
											<span className="recent-perf-stat__lbl">Total Runs</span>
										</div>
									)}
									{recentPerf.totalFours !== null && (
										<div className="recent-perf-stat">
											<span className="recent-perf-stat__val">{recentPerf.totalFours}</span>
											<span className="recent-perf-stat__lbl">Total 4s</span>
										</div>
									)}
									{recentPerf.totalSixes !== null && (
										<div className="recent-perf-stat">
											<span className="recent-perf-stat__val">{recentPerf.totalSixes}</span>
											<span className="recent-perf-stat__lbl">Total 6s</span>
										</div>
									)}
									<div className="recent-perf-stat">
										<span className="recent-perf-stat__val">{recentPerf.notOuts}</span>
										<span className="recent-perf-stat__lbl">Not Outs</span>
									</div>
									{recentPerf.strikeRate !== null && (
										<div className="recent-perf-stat">
											<span className="recent-perf-stat__val">{recentPerf.strikeRate}</span>
											<span className="recent-perf-stat__lbl">Strike Rate</span>
										</div>
									)}
									{recentPerf.average !== null && (
										<div className="recent-perf-stat">
											<span className="recent-perf-stat__val">{recentPerf.average}</span>
											<span className="recent-perf-stat__lbl">Average</span>
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
