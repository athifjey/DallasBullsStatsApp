import React from 'react';
import { SheetPage } from '../SheetPage';
import { fetchSheetData, SheetRow } from '../sheetsApi';

interface Leader {
	player: string;
	value: number;
}

interface RecentFormLeaders {
	topScorer: Leader | null;
	highestScore: Leader | null;
	mostFours: Leader | null;
	mostSixes: Leader | null;
	highestStrikeRate: Leader | null;
	highestAverage: Leader | null;
	eligiblePlayers: number;
}

interface BattingMetrics {
	runs: number;
	highestScore: number;
	fours: number;
	sixes: number;
	strikeRate: number | null;
	average: number | null;
}

const parseNum = (val: string | undefined): number => {
	const cleaned = (val ?? '').replace(/,/g, '').replace(/\*/g, '').trim();
	const parsed = Number.parseFloat(cleaned);
	return Number.isFinite(parsed) ? parsed : 0;
};

const findPlayerNameKey = (rows: SheetRow[]): string | null => {
	if (!rows.length) {
		return null;
	}

	const keys = Object.keys(rows[0]);
	const exact = keys.find(key => key.trim().toLowerCase() === 'player name');
	if (exact) {
		return exact;
	}

	return keys.find(key => key.trim().toLowerCase().includes('player')) ?? null;
};

const findCol = (headers: string[], patterns: RegExp[]): string | null => {
	for (const pattern of patterns) {
		const match = headers.find(header => pattern.test(header.trim()));
		if (match) {
			return match;
		}
	}

	return null;
};

const parseDate = (value: string | undefined): Date | null => {
	if (!value) {
		return null;
	}

	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
};

const pickLeader = (
	entries: Array<{ player: string; metrics: BattingMetrics }>,
	selector: (metrics: BattingMetrics) => number | null
): Leader | null => {
	let leader: Leader | null = null;

	for (const entry of entries) {
		const value = selector(entry.metrics);
		if (value === null) {
			continue;
		}

		if (!leader || value > leader.value) {
			leader = { player: entry.player, value };
		}
	}

	return leader;
};

const computeRecentFormLeaders = (rows: SheetRow[]): RecentFormLeaders | null => {
	if (!rows.length) {
		return null;
	}

	const headers = Object.keys(rows[0]);
	const playerKey = findPlayerNameKey(rows);
	const dateKey = findCol(headers, [/date/i]);
	const runsKey = findCol(headers, [/^runs?$/i, /^r$/i, /^score$/i, /runs/i]);
	const foursKey = findCol(headers, [/^4s?$/i, /^fours?$/i]);
	const sixesKey = findCol(headers, [/^6s?$/i, /^sixes?$/i]);
	const ballsKey = findCol(headers, [/^balls?$/i, /^bf$/i]);
	const notOutKey = findCol(headers, [/not[\s_-]?out/i, /^n\/o$/i, /^no$/i]);
	const dismissalKey = findCol(headers, [/dismissal/i, /how[\s_-]?out/i]);

	if (!playerKey || !dateKey || !runsKey) {
		return null;
	}

	const cutoff = new Date();
	cutoff.setFullYear(cutoff.getFullYear() - 1);

	const grouped = new Map<string, SheetRow[]>();

	for (const row of rows) {
		const player = (row[playerKey] ?? '').trim();
		const matchDate = parseDate(row[dateKey]);
		if (!player || !matchDate || matchDate < cutoff) {
			continue;
		}

		const existing = grouped.get(player);
		if (existing) {
			existing.push(row);
		} else {
			grouped.set(player, [row]);
		}
	}

	const eligibleEntries: Array<{
		player: string;
		metrics: BattingMetrics;
	}> = [];

	for (const [player, playerRows] of grouped.entries()) {
		if (playerRows.length < 5) {
			continue;
		}

		const lastFive = [...playerRows]
			.sort((a, b) => {
				const da = parseDate(a[dateKey])?.getTime() ?? 0;
				const db = parseDate(b[dateKey])?.getTime() ?? 0;
				return db - da;
			})
			.slice(0, 5);

		const runs = lastFive.reduce((sum, row) => sum + parseNum(row[runsKey]), 0);
		const highestScore = lastFive.reduce((highest, row) => Math.max(highest, parseNum(row[runsKey])), 0);
		const fours = foursKey ? lastFive.reduce((sum, row) => sum + parseNum(row[foursKey]), 0) : 0;
		const sixes = sixesKey ? lastFive.reduce((sum, row) => sum + parseNum(row[sixesKey]), 0) : 0;
		const balls = ballsKey ? lastFive.reduce((sum, row) => sum + parseNum(row[ballsKey]), 0) : 0;

		let notOuts = 0;
		if (notOutKey) {
			notOuts = lastFive.filter(row => {
				const value = (row[notOutKey] ?? '').toLowerCase().trim();
				return value === 'yes' || value === '1' || value === 'true' || value === 'not out' || value === 'n/o';
			}).length;
		} else if (dismissalKey) {
			notOuts = lastFive.filter(row => (row[dismissalKey] ?? '').toLowerCase().includes('not out')).length;
		} else {
			notOuts = lastFive.filter(row => (row[runsKey] ?? '').includes('*')).length;
		}

		const outs = lastFive.length - notOuts;
		const strikeRate = balls > 0 ? (runs / balls) * 100 : null;
		const average = outs > 0 ? runs / outs : null;

		eligibleEntries.push({
			player,
			metrics: {
				runs,
				highestScore,
				fours,
				sixes,
				strikeRate,
				average,
			},
		});
	}

	return {
		topScorer: pickLeader(eligibleEntries, metrics => metrics.runs),
		highestScore: pickLeader(eligibleEntries, metrics => metrics.highestScore),
		mostFours: pickLeader(eligibleEntries, metrics => metrics.fours),
		mostSixes: pickLeader(eligibleEntries, metrics => metrics.sixes),
		highestStrikeRate: pickLeader(eligibleEntries, metrics => metrics.strikeRate),
		highestAverage: pickLeader(eligibleEntries, metrics => metrics.average),
		eligiblePlayers: eligibleEntries.length,
	};
};

const RecentFormBanner: React.FC = () => {
	const [rows, setRows] = React.useState<SheetRow[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);

	React.useEffect(() => {
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

	const leaders = React.useMemo(() => computeRecentFormLeaders(rows), [rows]);

	if (loading) {
		return (
			<section className="batting-form-banner batting-form-banner--state">
				<div className="spinner" />
				<span>Loading recent form banner...</span>
			</section>
		);
	}

	if (error) {
		return <section className="batting-form-banner batting-form-banner--error">Unable to load recent form: {error}</section>;
	}

	if (!leaders || leaders.eligiblePlayers === 0) {
		return (
			<section className="batting-form-banner batting-form-banner--state">
				No recent-form leaders available. Requires players active in last 1 year with at least 5 matches.
			</section>
		);
	}

	const cards: Array<{ label: string; leader: Leader | null; format: (value: number) => string }> = [
		{ label: 'Top Scorer (Last 5)', leader: leaders.topScorer, format: value => value.toFixed(0) },
		{ label: 'Highest Score (Last 5)', leader: leaders.highestScore, format: value => value.toFixed(0) },
		{ label: 'Most 4s (Last 5)', leader: leaders.mostFours, format: value => value.toFixed(0) },
		{ label: 'Most 6s (Last 5)', leader: leaders.mostSixes, format: value => value.toFixed(0) },
		{ label: 'Highest Strike Rate (Last 5)', leader: leaders.highestStrikeRate, format: value => value.toFixed(2) },
		{ label: 'Highest Average (Last 5)', leader: leaders.highestAverage, format: value => value.toFixed(2) },
	];

	return (
		<section className="batting-form-banner">
			<div className="batting-form-banner__head">
				<h3 className="batting-form-banner__title">Recent Form Leaders</h3>
				<p className="batting-form-banner__sub">From Batting History: aggregated totals from last 5 matches per player, best across all eligible players active in last 1 year with 5+ matches.</p>
			</div>
			<div className="batting-form-banner__grid">
				{cards.map(card => (
					<div key={card.label} className="batting-form-banner__card">
						<div className="batting-form-banner__metric">{card.label}</div>
						{card.leader ? (
							<>
								<div className="batting-form-banner__player">{card.leader.player}</div>
								<div className="batting-form-banner__value">{card.format(card.leader.value)}</div>
							</>
						) : (
							<div className="batting-form-banner__empty">No qualifying data</div>
						)}
					</div>
				))}
			</div>
		</section>
	);
};

export const BattingSummaryPage: React.FC = () => (
	<SheetPage
		sheetName="Batting Summary"
		title="Batting Summary"
		description="Overall batting statistics for all players."
		defaultSortKey="Runs"
		defaultSortDir="desc"
		banner={<RecentFormBanner />}
	/>
);
