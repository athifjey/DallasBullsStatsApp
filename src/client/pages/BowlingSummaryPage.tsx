import React from 'react';
import { SheetPage } from '../SheetPage';
import { fetchSheetData, SheetRow } from '../sheetsApi';
import { calculateBowlingPoints, resolveBowlingPointColumnKeys } from '../pointsService';

const TOTAL_POINTS_HEADER = 'Total Points';

const findPlayerNameKeyFromRow = (row: SheetRow | undefined): string | null => {
	if (!row) {
		return null;
	}

	const keys = Object.keys(row);
	const exact = keys.find(key => key.trim().toLowerCase() === 'player name');
	if (exact) {
		return exact;
	}

	return keys.find(key => key.trim().toLowerCase().includes('player')) ?? null;
};

const enrichBowlingSummaryWithPoints = async (summaryRows: SheetRow[]): Promise<SheetRow[]> => {
	if (!summaryRows.length) {
		return summaryRows;
	}

	const summaryPlayerKey = findPlayerNameKeyFromRow(summaryRows[0]);
	if (!summaryPlayerKey) {
		return summaryRows;
	}

	const historyRows = await fetchSheetData('Bowling History');
	const historyPlayerKey = findPlayerNameKeyFromRow(historyRows[0]);
	if (!historyRows.length || !historyPlayerKey) {
		return summaryRows.map(row => ({ ...row, [TOTAL_POINTS_HEADER]: '0' }));
	}

	const pointKeys = resolveBowlingPointColumnKeys(Object.keys(historyRows[0]));
	const pointsByPlayer = new Map<string, number>();

	for (const row of historyRows) {
		const player = (row[historyPlayerKey] ?? '').trim();
		if (!player) {
			continue;
		}

		const current = pointsByPlayer.get(player) ?? 0;
		pointsByPlayer.set(player, current + calculateBowlingPoints(row, pointKeys));
	}

	return summaryRows.map(row => {
		const player = (row[summaryPlayerKey] ?? '').trim();
		const totalPoints = player ? pointsByPlayer.get(player) ?? 0 : 0;
		return {
			...row,
			[TOTAL_POINTS_HEADER]: totalPoints.toString(),
		};
	});
};

interface Leader {
	player: string;
	value: number;
}

interface FigureLeader {
	player: string;
	figure: string;
	wickets: number;
	runs: number;
}

interface BowlingRecentFormLeaders {
	mostWickets: Leader | null;
	mostMaidens: Leader | null;
	mostDots: Leader | null;
	mostOvers: Leader | null;
	lowestEconomy: Leader | null;
	bestBowling: FigureLeader | null;
	eligiblePlayers: number;
}

interface BowlingMetrics {
	wickets: number;
	maidens: number;
	dots: number;
	overs: number;
	economy: number | null;
	bestFigure: FigureLeader | null;
}

const parseNum = (val: string | undefined): number => {
	const cleaned = (val ?? '').replace(/,/g, '').replace(/\*/g, '').trim();
	const parsed = Number.parseFloat(cleaned);
	return Number.isFinite(parsed) ? parsed : 0;
};

const parseDate = (value: string | undefined): Date | null => {
	if (!value) {
		return null;
	}

	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
};

const parseOversToFloat = (value: string | undefined): number => {
	const raw = (value ?? '').trim();
	if (!raw) {
		return 0;
	}

	const match = raw.match(/^(\d+)(?:\.(\d+))?$/);
	if (!match) {
		return parseNum(raw);
	}

	const overs = Number.parseInt(match[1], 10);
	const ballsPart = match[2] ? Number.parseInt(match[2], 10) : 0;
	if (!Number.isFinite(ballsPart) || ballsPart < 0 || ballsPart > 5) {
		return parseNum(raw);
	}

	return overs + ballsPart / 6;
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

const pickLeader = (
	entries: Array<{ player: string; metrics: BowlingMetrics }>,
	selector: (metrics: BowlingMetrics) => number | null,
	direction: 'asc' | 'desc' = 'desc'
): Leader | null => {
	let leader: Leader | null = null;

	for (const entry of entries) {
		const value = selector(entry.metrics);
		if (value === null) {
			continue;
		}

		if (!leader) {
			leader = { player: entry.player, value };
			continue;
		}

		if ((direction === 'desc' && value > leader.value) || (direction === 'asc' && value < leader.value)) {
			leader = { player: entry.player, value };
		}
	}

	return leader;
};

const parseFigure = (value: string | undefined): { wickets: number; runs: number } | null => {
	if (!value) {
		return null;
	}

	const normalized = value.trim();
	const match = normalized.match(/(\d+)\s*\/\s*(\d+)/);
	if (!match) {
		return null;
	}

	return {
		wickets: Number.parseInt(match[1], 10),
		runs: Number.parseInt(match[2], 10),
	};
};

const formatFigure = (wickets: number, runs: number): string => `${wickets}/${runs}`;

const betterFigure = (candidate: { wickets: number; runs: number }, current: { wickets: number; runs: number } | null): boolean => {
	if (!current) {
		return true;
	}

	if (candidate.wickets !== current.wickets) {
		return candidate.wickets > current.wickets;
	}

	return candidate.runs < current.runs;
};

const computeRecentFormLeaders = (rows: SheetRow[]): BowlingRecentFormLeaders | null => {
	if (!rows.length) {
		return null;
	}

	const headers = Object.keys(rows[0]);
	const playerKey = findPlayerNameKey(rows);
	const dateKey = findCol(headers, [/date/i]);
	const wicketsKey = findCol(headers, [/^wkts?$/i, /^wickets?$/i, /^w$/i]);
	const maidensKey = findCol(headers, [/^maidens?$/i, /^m$/i]);
	const dotsKey = findCol(headers, [/^dots?$/i, /dot[\s_-]?balls?/i, /^db$/i]);
	const runsKey = findCol(headers, [/^runs?\s*conceded$/i, /^runs?$/i, /^r$/i, /^rc$/i]);
	const oversKey = findCol(headers, [/^overs?$/i, /^o$/i]);
	const figuresKey = findCol(headers, [/^figures?$/i, /^best$/i, /^bbm?$/i]);

	if (!playerKey || !dateKey || !wicketsKey) {
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

	const eligibleEntries: Array<{ player: string; metrics: BowlingMetrics }> = [];

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

		const wickets = lastFive.reduce((sum, row) => sum + parseNum(row[wicketsKey]), 0);
		const maidens = maidensKey ? lastFive.reduce((sum, row) => sum + parseNum(row[maidensKey]), 0) : 0;
		const dots = dotsKey ? lastFive.reduce((sum, row) => sum + parseNum(row[dotsKey]), 0) : 0;
		const totalOvers = oversKey ? lastFive.reduce((sum, row) => sum + parseOversToFloat(row[oversKey]), 0) : null;
		const totalRunsConceded = runsKey ? lastFive.reduce((sum, row) => sum + parseNum(row[runsKey]), 0) : null;
		const economy = totalRunsConceded !== null && totalOvers !== null && totalOvers > 0
			? totalRunsConceded / totalOvers
			: null;

		let bestFigureScore: { wickets: number; runs: number } | null = null;
		for (const row of lastFive) {
			const fromFigures = figuresKey ? parseFigure(row[figuresKey]) : null;
			const fromRunsAndWickets = runsKey
				? { wickets: parseNum(row[wicketsKey]), runs: parseNum(row[runsKey]) }
				: null;
			const candidate = fromFigures ?? fromRunsAndWickets;
			if (!candidate) {
				continue;
			}

			if (betterFigure(candidate, bestFigureScore)) {
				bestFigureScore = candidate;
			}
		}

		eligibleEntries.push({
			player,
			metrics: {
				wickets,
				maidens,
				dots,
				overs: totalOvers ?? 0,
				economy,
				bestFigure: bestFigureScore
					? {
						player,
						figure: formatFigure(bestFigureScore.wickets, bestFigureScore.runs),
						wickets: bestFigureScore.wickets,
						runs: bestFigureScore.runs,
					}
					: null,
			},
		});
	}

	let bestBowling: FigureLeader | null = null;
	for (const entry of eligibleEntries) {
		const candidate = entry.metrics.bestFigure;
		if (!candidate) {
			continue;
		}

		if (!bestBowling || betterFigure(candidate, bestBowling)) {
			bestBowling = candidate;
		}
	}

	return {
		mostWickets: pickLeader(eligibleEntries, metrics => metrics.wickets, 'desc'),
		mostMaidens: pickLeader(eligibleEntries, metrics => metrics.maidens, 'desc'),
		mostDots: dotsKey ? pickLeader(eligibleEntries, metrics => metrics.dots, 'desc') : null,
		mostOvers: oversKey ? pickLeader(eligibleEntries, metrics => metrics.overs, 'desc') : null,
		lowestEconomy: pickLeader(eligibleEntries, metrics => metrics.economy, 'asc'),
		bestBowling,
		eligiblePlayers: eligibleEntries.length,
	};
};

const BowlingRecentFormBanner: React.FC = () => {
	const [rows, setRows] = React.useState<SheetRow[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);

	React.useEffect(() => {
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

	const leaders = React.useMemo(() => computeRecentFormLeaders(rows), [rows]);

	if (loading) {
		return (
			<section className="batting-form-banner batting-form-banner--state">
				<div className="spinner" />
				<span>Loading recent bowling form banner...</span>
			</section>
		);
	}

	if (error) {
		return <section className="batting-form-banner batting-form-banner--error">Unable to load recent bowling form: {error}</section>;
	}

	if (!leaders || leaders.eligiblePlayers === 0) {
		return (
			<section className="batting-form-banner batting-form-banner--state">
				No recent bowling-form leaders available. Requires players active in last 1 year with at least 5 matches.
			</section>
		);
	}

	const cards: Array<{ label: string; player: string | null; valueText: string | null }> = [
		{
			label: 'Most Wickets (Last 5)',
			player: leaders.mostWickets?.player ?? null,
			valueText: leaders.mostWickets ? leaders.mostWickets.value.toFixed(0) : null,
		},
		{
			label: 'Most Maidens (Last 5)',
			player: leaders.mostMaidens?.player ?? null,
			valueText: leaders.mostMaidens ? leaders.mostMaidens.value.toFixed(0) : null,
		},
		{
			label: 'Most Dots (Last 5)',
			player: leaders.mostDots?.player ?? null,
			valueText: leaders.mostDots ? leaders.mostDots.value.toFixed(0) : null,
		},
		{
			label: 'Most Overs (Last 5)',
			player: leaders.mostOvers?.player ?? null,
			valueText: leaders.mostOvers ? leaders.mostOvers.value.toFixed(1) : null,
		},
		{
			label: 'Lowest Economy (Last 5)',
			player: leaders.lowestEconomy?.player ?? null,
			valueText: leaders.lowestEconomy ? leaders.lowestEconomy.value.toFixed(2) : null,
		},
		{
			label: 'Best Bowling (Last 5)',
			player: leaders.bestBowling?.player ?? null,
			valueText: leaders.bestBowling?.figure ?? null,
		},
	];

	return (
		<section className="batting-form-banner">
			<div className="batting-form-banner__head">
				<h3 className="batting-form-banner__title">Recent Bowling Form Leaders</h3>
				<p className="batting-form-banner__sub">From Bowling History: aggregated totals from last 5 matches per player, best across all eligible players active in last 1 year with 5+ matches.</p>
			</div>
			<div className="batting-form-banner__grid">
				{cards.map(card => (
					<div key={card.label} className="batting-form-banner__card">
						<div className="batting-form-banner__metric">{card.label}</div>
						{card.player && card.valueText ? (
							<>
								<div className="batting-form-banner__player">{card.player}</div>
								<div className="batting-form-banner__value">{card.valueText}</div>
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

export const BowlingSummaryPage: React.FC = () => (
	<SheetPage
		sheetName="Bowling Summary"
		title="Bowling Summary"
		description="Overall bowling statistics for all players."
		defaultSortKey="Wickets"
		defaultSortDir="desc"
		transformRows={enrichBowlingSummaryWithPoints}
		banner={<BowlingRecentFormBanner />}
	/>
);
