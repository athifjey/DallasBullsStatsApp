import React, { useEffect, useMemo, useState } from 'react';
import { fetchSheetData, SheetRow } from '../sheetsApi';

interface ChartRow {
	name: string;
	value: number;
}

interface ChartConfig {
	title: string;
	accentClass: string;
	valueFormatter: (value: number) => string;
	rows: ChartRow[];
}

const parseNumber = (value: string | undefined): number | null => {
	if (!value) {
		return null;
	}
	const cleaned = value.replace(/,/g, '').replace(/[^\d.-]/g, '');
	const parsed = Number.parseFloat(cleaned);
	return Number.isFinite(parsed) ? parsed : null;
};

const findColumnKey = (row: SheetRow | undefined, candidates: string[]): string | null => {
	if (!row) {
		return null;
	}
	const keys = Object.keys(row);
	for (const candidate of candidates) {
		const match = keys.find(key => key.trim().toLowerCase() === candidate.toLowerCase());
		if (match) {
			return match;
		}
	}
	return null;
};

const findPlayerNameKey = (row: SheetRow | undefined): string | null => {
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

const topN = (
	rows: SheetRow[],
	nameKey: string | null,
	matchesKey: string | null,
	inningsKey: string | null,
	valueKey: string | null,
	direction: 'asc' | 'desc',
	limit = 5
): ChartRow[] => {
	if (!nameKey || !valueKey) {
		return [];
	}

	const parsedRows: ChartRow[] = rows
		.map(row => {
			const name = (row[nameKey] ?? '').trim();
			const matches = matchesKey ? parseNumber(row[matchesKey]) : null;
			const innings = inningsKey ? parseNumber(row[inningsKey]) : null;
			const matchCount = matches ?? innings;
			const value = parseNumber(row[valueKey]);
			if (!name || matchCount === null || matchCount <= 10 || value === null) {
				return null;
			}
			return { name, value };
		})
		.filter((row): row is ChartRow => row !== null);

	parsedRows.sort((a, b) => (direction === 'desc' ? b.value - a.value : a.value - b.value));
	return parsedRows.slice(0, limit);
};

const ChartCard: React.FC<ChartConfig> = ({ title, accentClass, valueFormatter, rows }) => {
	const maxValue = rows.length ? Math.max(...rows.map(row => row.value)) : 0;

	return (
		<section className="dashboard-card">
			<h3 className="dashboard-card__title">{title}</h3>
			{rows.length === 0 ? (
				<div className="dashboard-card__empty">No records available.</div>
			) : (
				<div className="dashboard-bars">
					{rows.map((row, index) => (
						<div key={`${row.name}-${index}`} className="dashboard-bars__row">
							<div className="dashboard-bars__meta">
								<span className="dashboard-bars__name">{row.name}</span>
								<span className="dashboard-bars__value">{valueFormatter(row.value)}</span>
							</div>
							<div className="dashboard-bars__track">
								<div
									className={`dashboard-bars__fill ${accentClass}`}
									style={{ width: `${maxValue === 0 ? 0 : (row.value / maxValue) * 100}%` }}
								/>
							</div>
						</div>
					))}
				</div>
			)}
		</section>
	);
};

export const DashboardPage: React.FC = () => {
	const [battingRows, setBattingRows] = useState<SheetRow[]>([]);
	const [bowlingRows, setBowlingRows] = useState<SheetRow[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		setLoading(true);
		setError(null);
		Promise.all([fetchSheetData('Batting Summary'), fetchSheetData('Bowling Summary')])
			.then(([battingData, bowlingData]) => {
				setBattingRows(battingData);
				setBowlingRows(bowlingData);
				setLoading(false);
			})
			.catch((err: Error) => {
				setError(err.message);
				setLoading(false);
			});
	}, []);

	const charts = useMemo(() => {
		const battingPlayerKey = findPlayerNameKey(battingRows[0]);
		const bowlingPlayerKey = findPlayerNameKey(bowlingRows[0]);

		const battingMatchesKey = findColumnKey(battingRows[0], ['Matches', 'Match', 'Mat', 'M']);
		const bowlingMatchesKey = findColumnKey(bowlingRows[0], ['Matches', 'Match', 'Mat', 'M']);
		const battingInningsKey = findColumnKey(battingRows[0], ['Innings', 'Inns', 'Inn']);
		const bowlingInningsKey = findColumnKey(bowlingRows[0], ['Innings', 'Inns', 'Inn']);

		const wicketsKey = findColumnKey(bowlingRows[0], ['Wkts', 'Wickets', 'Wicket']);
		const strikeRateKey = findColumnKey(battingRows[0], ['SR', 'Strike Rate', 'Strike rate']);
		const runsKey = findColumnKey(battingRows[0], ['Runs', 'Run']);
		const economyKey = findColumnKey(bowlingRows[0], ['Econ', 'Economy', 'Eco']);

		return {
			topWickets: topN(bowlingRows, bowlingPlayerKey, bowlingMatchesKey, bowlingInningsKey, wicketsKey, 'desc'),
			topStrikeRate: topN(battingRows, battingPlayerKey, battingMatchesKey, battingInningsKey, strikeRateKey, 'desc'),
			topRuns: topN(battingRows, battingPlayerKey, battingMatchesKey, battingInningsKey, runsKey, 'desc'),
			topEconomy: topN(bowlingRows, bowlingPlayerKey, bowlingMatchesKey, bowlingInningsKey, economyKey, 'asc'),
		};
	}, [battingRows, bowlingRows]);

	return (
		<div className="page">
			<div className="page__header">
				<h2 className="page__title">Dashboard</h2>
				<p className="page__description">Top performers snapshot for Dallas Bulls.</p>
			</div>

			{loading && (
				<div className="page__state">
					<div className="spinner" />
					<span>Loading dashboard data...</span>
				</div>
			)}

			{error && <div className="page__state page__state--error">{error}</div>}

			{!loading && !error && (
				<div className="dashboard-grid">
					<ChartCard
						title="Top 5 Wicket Takers (min 10 matches)"
						accentClass="dashboard-bars__fill--wickets"
						valueFormatter={value => value.toFixed(0)}
						rows={charts.topWickets}
					/>
					<ChartCard
						title="Top 5 Strike Rate (min 10 matches)"
						accentClass="dashboard-bars__fill--strike-rate"
						valueFormatter={value => value.toFixed(2)}
						rows={charts.topStrikeRate}
					/>
					<ChartCard
						title="Top 5 Run Getters (min 10 matches)"
						accentClass="dashboard-bars__fill--runs"
						valueFormatter={value => value.toFixed(0)}
						rows={charts.topRuns}
					/>
					<ChartCard
						title="Top 5 Economy Bowlers (min 10 matches)"
						accentClass="dashboard-bars__fill--economy"
						valueFormatter={value => value.toFixed(2)}
						rows={charts.topEconomy}
					/>
				</div>
			)}
		</div>
	);
};
