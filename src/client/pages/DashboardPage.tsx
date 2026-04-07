import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchScheduleData, fetchSheetData, SheetRow } from '../sheetsApi';
import {
	calculateBattingPoints,
	calculateBowlingPoints,
	resolveBattingPointColumnKeys,
	resolveBowlingPointColumnKeys,
} from '../pointsService';

const APP_VERSION = __APP_VERSION__;

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

interface UpcomingScheduleEntry {
	date: Date;
	dateLabel: string;
	team1: string;
	team2: string;
	venue: string;
	time: string;
	umpiringOne: string;
	umpiringTwo: string;
}

interface UpcomingScheduleEvent {
	id: string;
	entry: UpcomingScheduleEntry;
	isToday: boolean;
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

const parseScheduleDate = (value: string | undefined): Date | null => {
	if (!value) {
		return null;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	const direct = new Date(trimmed);
	if (!Number.isNaN(direct.getTime())) {
		return direct;
	}

	const match = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
	if (!match) {
		return null;
	}

	const first = Number.parseInt(match[1], 10);
	const second = Number.parseInt(match[2], 10);
	const yearRaw = Number.parseInt(match[3], 10);
	const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;

	const month = second > 12 ? first : second;
	const day = second > 12 ? second : first;
	const parsed = new Date(year, month - 1, day);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isDallasBulls = (value: string | undefined): boolean => {
	return (value ?? '').trim().toLowerCase().includes('dallas bulls');
};

const startOfToday = (): Date => {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const isSameDay = (left: Date, right: Date): boolean => {
	return left.getFullYear() === right.getFullYear()
		&& left.getMonth() === right.getMonth()
		&& left.getDate() === right.getDate();
};

const formatDayName = (date: Date): string => {
	return date.toLocaleDateString('en-AU', { weekday: 'long' });
};

const toUpcomingScheduleEntry = (row: SheetRow): UpcomingScheduleEntry | null => {
	const dateKey = findColumnKey(row, ['Date']);
	const team1Key = findColumnKey(row, ['Team 1', 'Team1']);
	const team2Key = findColumnKey(row, ['Team 2', 'Team2']);
	const umpiringOneKey = findColumnKey(row, ['Umpiring 1', 'Umpiring1']);
	const umpiringTwoKey = findColumnKey(row, ['Umpiring 2', 'Umpiring2']);
	const venueKey = findColumnKey(row, ['Venue']);
	const timeKey = findColumnKey(row, ['Time']);

	if (!dateKey || !team1Key || !team2Key) {
		return null;
	}

	const dateLabel = row[dateKey] ?? '';
	const date = parseScheduleDate(dateLabel);
	if (!date) {
		return null;
	}

	return {
		date,
		dateLabel,
		team1: row[team1Key] ?? '',
		team2: row[team2Key] ?? '',
		venue: venueKey ? row[venueKey] ?? '' : '',
		time: timeKey ? row[timeKey] ?? '' : '',
		umpiringOne: umpiringOneKey ? row[umpiringOneKey] ?? '' : '',
		umpiringTwo: umpiringTwoKey ? row[umpiringTwoKey] ?? '' : '',
	};
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

const topEconomyBowlers = (
	rows: SheetRow[],
	nameKey: string | null,
	matchesKey: string | null,
	inningsKey: string | null,
	oversKey: string | null,
	economyKey: string | null,
	limit = 5
): ChartRow[] => {
	if (!nameKey || !economyKey || !oversKey) {
		return [];
	}

	const parsedRows: ChartRow[] = rows
		.map(row => {
			const name = (row[nameKey] ?? '').trim();
			const matches = matchesKey ? parseNumber(row[matchesKey]) : null;
			const innings = inningsKey ? parseNumber(row[inningsKey]) : null;
			const matchCount = matches ?? innings;
			const oversBowled = parseNumber(row[oversKey]);
			const economy = parseNumber(row[economyKey]);

			if (!name || matchCount === null || matchCount < 10 || oversBowled === null || oversBowled < 10 || economy === null) {
				return null;
			}

			return { name, value: economy };
		})
		.filter((row): row is ChartRow => row !== null);

	parsedRows.sort((a, b) => a.value - b.value);
	return parsedRows.slice(0, limit);
};

const topPointLeaders = (
	rows: SheetRow[],
	pointCalculator: (row: SheetRow) => number,
	limit = 5
): ChartRow[] => {
	if (!rows.length) {
		return [];
	}

	const playerKey = findPlayerNameKey(rows[0]);
	if (!playerKey) {
		return [];
	}

	const pointsByPlayer = new Map<string, number>();
	for (const row of rows) {
		const playerName = (row[playerKey] ?? '').trim();
		if (!playerName) {
			continue;
		}

		const existing = pointsByPlayer.get(playerName) ?? 0;
		pointsByPlayer.set(playerName, existing + pointCalculator(row));
	}

	return [...pointsByPlayer.entries()]
		.map(([name, value]) => ({ name, value }))
		.sort((a, b) => b.value - a.value)
		.slice(0, limit);
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
									style={{
										width: `${maxValue === 0 ? 0 : (row.value / maxValue) * 100}%`,
										animationDelay: `${index * 120}ms`,
									}}
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
	const videoRef = useRef<HTMLVideoElement>(null);
	const [battingRows, setBattingRows] = useState<SheetRow[]>([]);
	const [bowlingRows, setBowlingRows] = useState<SheetRow[]>([]);
	const [battingHistoryRows, setBattingHistoryRows] = useState<SheetRow[]>([]);
	const [bowlingHistoryRows, setBowlingHistoryRows] = useState<SheetRow[]>([]);
	const [scheduleRows, setScheduleRows] = useState<SheetRow[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		setLoading(true);
		setError(null);
		Promise.all([
			fetchSheetData('Batting Summary'),
			fetchSheetData('Bowling Summary'),
			fetchSheetData('Batting History'),
			fetchSheetData('Bowling History'),
			fetchScheduleData('Schedule').catch(() => []),
		])
			.then(([battingData, bowlingData, battingHistoryData, bowlingHistoryData, scheduleData]) => {
				setBattingRows(battingData);
				setBowlingRows(bowlingData);
				setBattingHistoryRows(battingHistoryData);
				setBowlingHistoryRows(bowlingHistoryData);
				setScheduleRows(scheduleData);
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
		const battingPointKeys = battingHistoryRows.length
			? resolveBattingPointColumnKeys(Object.keys(battingHistoryRows[0]))
			: null;
		const bowlingPointKeys = bowlingHistoryRows.length
			? resolveBowlingPointColumnKeys(Object.keys(bowlingHistoryRows[0]))
			: null;

		const battingMatchesKey = findColumnKey(battingRows[0], ['Matches', 'Match', 'Mat', 'M']);
		const bowlingMatchesKey = findColumnKey(bowlingRows[0], ['Matches', 'Match', 'Mat', 'M']);
		const battingInningsKey = findColumnKey(battingRows[0], ['Innings', 'Inns', 'Inn']);
		const bowlingInningsKey = findColumnKey(bowlingRows[0], ['Innings', 'Inns', 'Inn']);

		const wicketsKey = findColumnKey(bowlingRows[0], ['Wkts', 'Wickets', 'Wicket']);
		const strikeRateKey = findColumnKey(battingRows[0], ['SR', 'Strike Rate', 'Strike rate']);
		const runsKey = findColumnKey(battingRows[0], ['Runs', 'Run']);
		const economyKey = findColumnKey(bowlingRows[0], ['Econ', 'Economy', 'Eco']);
		const oversKey = findColumnKey(bowlingRows[0], ['Overs', 'Over', 'O']);

		return {
			topWickets: topN(bowlingRows, bowlingPlayerKey, bowlingMatchesKey, bowlingInningsKey, wicketsKey, 'desc'),
			topStrikeRate: topN(battingRows, battingPlayerKey, battingMatchesKey, battingInningsKey, strikeRateKey, 'desc'),
			topRuns: topN(battingRows, battingPlayerKey, battingMatchesKey, battingInningsKey, runsKey, 'desc'),
			topEconomy: topEconomyBowlers(
				bowlingRows,
				bowlingPlayerKey,
				bowlingMatchesKey,
				bowlingInningsKey,
				oversKey,
				economyKey
			),
			topBattingPoints: battingPointKeys
				? topPointLeaders(battingHistoryRows, row => calculateBattingPoints(row, battingPointKeys))
				: [],
			topBowlingPoints: bowlingPointKeys
				? topPointLeaders(bowlingHistoryRows, row => calculateBowlingPoints(row, bowlingPointKeys))
				: [],
		};
	}, [battingRows, bowlingRows, battingHistoryRows, bowlingHistoryRows]);

	const nextMatchEvents = useMemo((): UpcomingScheduleEvent[] => {
		const today = startOfToday();
		return scheduleRows
			.map(toUpcomingScheduleEntry)
			.filter((entry): entry is UpcomingScheduleEntry => entry !== null)
			.filter(entry => entry.date >= today && (isDallasBulls(entry.team1) || isDallasBulls(entry.team2)))
			.sort((a, b) => a.date.getTime() - b.date.getTime())
			.slice(0, 3)
			.map((entry, index) => ({
				id: `match-${entry.date.getTime()}-${index}`,
				entry,
				isToday: isSameDay(entry.date, today),
			}));
	}, [scheduleRows]);

	const nextUmpiringEvents = useMemo((): UpcomingScheduleEvent[] => {
		const today = startOfToday();
		return scheduleRows
			.map(toUpcomingScheduleEntry)
			.filter((entry): entry is UpcomingScheduleEntry => entry !== null)
			.filter(entry => entry.date >= today && (isDallasBulls(entry.umpiringOne) || isDallasBulls(entry.umpiringTwo)))
			.sort((a, b) => a.date.getTime() - b.date.getTime())
			.slice(0, 3)
			.map((entry, index) => ({
				id: `umpiring-${entry.date.getTime()}-${index}`,
				entry,
				isToday: isSameDay(entry.date, today),
			}));
	}, [scheduleRows]);

	return (
		<div className="page dashboard-page">
			<div className="dashboard-bg">
				<video
					ref={videoRef}
					className="dashboard-bg__video"
					autoPlay
					muted
					loop
					playsInline
					poster="./assets/team-banner.jpg"
					onCanPlay={() => { if (videoRef.current) videoRef.current.playbackRate = 0.6; }}
				>
					<source src="https://videos.pexels.com/video-files/32660384/13925195_2560_1440_24fps.mp4" type="video/mp4" />
					<source src="https://videos.pexels.com/video-files/35260711/14938100_2560_1440_24fps.mp4" type="video/mp4" />
					<source src="https://videos.pexels.com/video-files/33907672/14389701_2560_1440_30fps.mp4" type="video/mp4" />
				</video>
				<div className="dashboard-bg__overlay" />
			</div>

			<div className="dashboard-hero">
				<div
					className="dashboard-hero__banner"
					style={{ backgroundImage: 'url(./assets/team-banner.jpg)' }}
				>
					<div className="dashboard-hero__banner-vignette" />
					<div className="dashboard-hero__banner-content">
						<h2 className="dashboard-hero__title">Dallas Bulls</h2>
						<p className="dashboard-hero__sub">Cricket Team Statistics</p>
					</div>
				</div>
			</div>

			{loading && (
				<div className="page__state">
					<div className="spinner" />
					<span>Loading dashboard data...</span>
				</div>
			)}

			{error && <div className="page__state page__state--error">{error}</div>}

			{!loading && !error && (
				<>
					<div className="dashboard-schedule-row">
					<section className="dashboard-schedule-widget" aria-label="Next 3 Dallas Bulls matches">
						<h3 className="dashboard-schedule-widget__title">
							<span className="dashboard-schedule-banner__pill">Match</span>
							Next 3 Matches
						</h3>
						<div className="dashboard-schedule-banner__list">
							{nextMatchEvents.length > 0 ? (
								nextMatchEvents.map(event => (
									<article key={event.id} className="dashboard-schedule-banner__event">
										<div className="dashboard-schedule-banner__event-head">
											<span className="dashboard-schedule-banner__pill">Match</span>
											{event.isToday && <span className="dashboard-schedule-banner__today">Today</span>}
										</div>
										<p className="dashboard-schedule-banner__line">{formatDayName(event.entry.date)}, {event.entry.dateLabel} | {event.entry.time || 'Time TBA'}</p>
										<p className="dashboard-schedule-banner__line dashboard-schedule-banner__line--strong">{event.entry.team1} vs {event.entry.team2}</p>
										<p className="dashboard-schedule-banner__line">{event.entry.venue || 'Venue TBA'}</p>
									</article>
								))
							) : (
								<p className="dashboard-schedule-banner__line">No upcoming Dallas Bulls matches found.</p>
							)}
						</div>
					</section>
					<section className="dashboard-schedule-widget" aria-label="Next 3 Dallas Bulls umpiring duties">
						<h3 className="dashboard-schedule-widget__title">
							<span className="dashboard-schedule-banner__pill dashboard-schedule-banner__pill--umpiring">Umpiring</span>
							Next 3 Umpiring Duties
						</h3>
						<div className="dashboard-schedule-banner__list">
							{nextUmpiringEvents.length > 0 ? (
								nextUmpiringEvents.map(event => (
									<article key={event.id} className="dashboard-schedule-banner__event">
										<div className="dashboard-schedule-banner__event-head">
											<span className="dashboard-schedule-banner__pill dashboard-schedule-banner__pill--umpiring">Umpiring</span>
											{event.isToday && <span className="dashboard-schedule-banner__today">Today</span>}
										</div>
										<p className="dashboard-schedule-banner__line">{formatDayName(event.entry.date)}, {event.entry.dateLabel} | {event.entry.time || 'Time TBA'}</p>
										<p className="dashboard-schedule-banner__line dashboard-schedule-banner__line--strong">{event.entry.team1} vs {event.entry.team2}</p>
										<p className="dashboard-schedule-banner__line">{event.entry.venue || 'Venue TBA'}</p>
									</article>
								))
							) : (
								<p className="dashboard-schedule-banner__line">No upcoming Dallas Bulls umpiring duties found.</p>
							)}
						</div>
					</section>
				</div>
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
							title="Top 5 Economy Bowlers (min 10 matches & 10 overs bowled)"
							accentClass="dashboard-bars__fill--economy"
							valueFormatter={value => value.toFixed(2)}
							rows={charts.topEconomy}
						/>
						<ChartCard
							title="Top 5 Batting Points (from Batting History)"
							accentClass="dashboard-bars__fill--runs"
							valueFormatter={value => value.toFixed(0)}
							rows={charts.topBattingPoints}
						/>
						<ChartCard
							title="Top 5 Bowling Points (from Bowling History)"
							accentClass="dashboard-bars__fill--wickets"
							valueFormatter={value => value.toFixed(0)}
							rows={charts.topBowlingPoints}
						/>
					</div>
					<footer className="dashboard-footer" aria-label="Application information">
						<span className="dashboard-footer__item">Version: {APP_VERSION}</span>
						<span className="dashboard-footer__item">Managed by: AJ Labs</span>
					</footer>
				</>
			)}
		</div>
	);
};
