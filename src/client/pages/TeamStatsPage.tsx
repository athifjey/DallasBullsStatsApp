import React, { useEffect, useMemo, useState } from 'react';
import { fetchSheetData, SheetRow } from '../sheetsApi';
import {
	calculateBattingPoints,
	calculateBowlingPoints,
	resolveBattingPointColumnKeys,
	resolveBowlingPointColumnKeys,
} from '../pointsService';

type Outcome = 'Win' | 'Loss' | 'Tie' | 'No Result';
type OutcomeFilter = 'All' | Outcome;
type PerformanceView = 'opponents' | 'grounds';
type Venue = 'Home' | 'Away' | 'Unknown';
type SortKey = 'date' | 'opponent' | 'ground' | 'outcome';
type SortDir = 'asc' | 'desc';

interface TeamStatsMatch {
	date: string;
	ground: string;
	team1: string;
	team2: string;
	opponent: string;
	winnerResult: string;
	message: string;
	outcome: Outcome;
	venue: Venue;
}

interface PointsLeader {
	player: string;
	points: number;
}

interface RecordBreakdown {
	wins: number;
	losses: number;
	ties: number;
	noResults: number;
}

interface PerformanceGroup {
	name: string;
	fixtures: number;
	record: RecordBreakdown;
	winRate: number;
}

const TEAM_NAME = 'Dallas Bulls';

const normalizeText = (value: string | undefined): string => (value ?? '').trim().toLowerCase();

const isDallasBulls = (value: string | undefined): boolean => normalizeText(value) === normalizeText(TEAM_NAME);

const parseDateValue = (value: string): number => {
	const timestamp = new Date(value).getTime();
	return Number.isNaN(timestamp) ? 0 : timestamp;
};

const normalizeDateKey = (value: string | undefined): string | null => {
	if (!value) {
		return null;
	}

	const timestamp = parseDateValue(value);
	if (!timestamp) {
		return null;
	}

	return new Date(timestamp).toISOString().slice(0, 10);
};

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

const findDateKeyFromRow = (row: SheetRow | undefined): string | null => {
	if (!row) {
		return null;
	}

	return Object.keys(row).find(key => /date/i.test(key.trim())) ?? null;
};

const topLeaderFromMap = (pointsByPlayer: Map<string, number>): PointsLeader | null => {
	let leader: PointsLeader | null = null;

	for (const [player, points] of pointsByPlayer.entries()) {
		if (!leader || points > leader.points) {
			leader = { player, points };
		}
	}

	return leader;
};

const formatDate = (value: string): string => {
	const timestamp = parseDateValue(value);
	if (!timestamp) {
		return value;
	}

	return new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	}).format(timestamp);
};

const resolveOutcome = (winnerResult: string): Outcome => {
	const normalized = normalizeText(winnerResult);
	if (!normalized) {
		return 'No Result';
	}
	if (normalized.includes('tie')) {
		return 'Tie';
	}
	if (normalized.includes('no result')) {
		return 'No Result';
	}
	if (isDallasBulls(winnerResult)) {
		return 'Win';
	}
	return 'Loss';
};

const toTeamStatsMatch = (row: SheetRow): TeamStatsMatch | null => {
	const date = (row.Date ?? '').trim();
	const team1 = (row['Team 1'] ?? '').trim();
	const team2 = (row['Team 2'] ?? '').trim();
	if (!date || (!isDallasBulls(team1) && !isDallasBulls(team2))) {
		return null;
	}

	return {
		date,
		ground: (row.Ground ?? '').trim(),
		team1,
		team2,
		opponent: isDallasBulls(team1) ? team2 : team1,
		winnerResult: (row['Winner/Result'] ?? '').trim(),
		message: (row.Message ?? '').trim(),
		outcome: resolveOutcome(row['Winner/Result'] ?? ''),
		venue: isDallasBulls(team1) ? 'Home' : isDallasBulls(team2) ? 'Away' : 'Unknown',
	};
};

const createEmptyRecord = (): RecordBreakdown => ({
	wins: 0,
	losses: 0,
	ties: 0,
	noResults: 0,
});

const getRecordBreakdown = (matches: TeamStatsMatch[]): RecordBreakdown => {
	return matches.reduce<RecordBreakdown>((record, match) => {
		if (match.outcome === 'Win') {
			record.wins += 1;
		} else if (match.outcome === 'Loss') {
			record.losses += 1;
		} else if (match.outcome === 'Tie') {
			record.ties += 1;
		} else {
			record.noResults += 1;
		}
		return record;
	}, createEmptyRecord());
};

const formatRecord = (record: RecordBreakdown): string => {
	return `${record.wins}W ${record.losses}L ${record.ties}T ${record.noResults}NR`;
};

const getRecentForm = (matches: TeamStatsMatch[], limit = 5): Outcome[] => matches.slice(0, limit).map(match => match.outcome);

const toFormToken = (outcome: Outcome): string => {
	if (outcome === 'Win') {
		return 'W';
	}
	if (outcome === 'Loss') {
		return 'L';
	}
	if (outcome === 'Tie') {
		return 'T';
	}
	return 'NR';
};

const groupBy = (matches: TeamStatsMatch[], keySelector: (match: TeamStatsMatch) => string): Array<{ name: string; matches: TeamStatsMatch[] }> => {
	const grouped = new Map<string, TeamStatsMatch[]>();
	for (const match of matches) {
		const key = keySelector(match) || 'Unknown';
		const existing = grouped.get(key);
		if (existing) {
			existing.push(match);
		} else {
			grouped.set(key, [match]);
		}
	}

	return [...grouped.entries()]
		.map(([name, groupedMatches]) => ({ name, matches: groupedMatches }))
		.sort((a, b) => b.matches.length - a.matches.length || a.name.localeCompare(b.name));
};

const toPerformanceGroups = (groupedMatches: Array<{ name: string; matches: TeamStatsMatch[] }>, limit = 6): PerformanceGroup[] => {
	return groupedMatches.slice(0, limit).map(group => {
		const record = getRecordBreakdown(group.matches);
		const decidedMatches = record.wins + record.losses;
		return {
			name: group.name,
			fixtures: group.matches.length,
			record,
			winRate: decidedMatches > 0 ? (record.wins / decidedMatches) * 100 : 0,
		};
	});
};

const PerformanceChart: React.FC<{
	title: string;
	description: string;
	groups: PerformanceGroup[];
	emptyLabel: string;
}> = ({ title, description, groups, emptyLabel }) => {
	const maxFixtures = groups.length ? Math.max(...groups.map(group => group.fixtures)) : 0;

	return (
		<section className="team-performance-chart">
			<div className="team-performance-chart__head">
				<h3 className="team-performance-chart__title">{title}</h3>
				<p className="team-performance-chart__description">{description}</p>
			</div>
			{groups.length === 0 ? (
				<div className="team-performance-chart__empty">{emptyLabel}</div>
			) : (
				<div className="team-performance-chart__rows">
					{groups.map(group => (
						<div key={group.name} className="team-performance-chart__row">
							<div className="team-performance-chart__meta">
								<div>
									<div className="team-performance-chart__name">{group.name}</div>
									<div className="team-performance-chart__record">{formatRecord(group.record)}</div>
								</div>
								<div className="team-performance-chart__summary">
									<span>{group.fixtures} fixtures</span>
									<span>{group.winRate.toFixed(1)}% win rate</span>
								</div>
							</div>
							<div className="team-performance-chart__bar-track" aria-hidden="true">
								<div className="team-performance-chart__bar-fill" style={{ width: `${maxFixtures === 0 ? 0 : (group.fixtures / maxFixtures) * 100}%` }} />
							</div>
							<div className="team-performance-chart__stack" aria-label={`${group.name} result mix`}>
								{group.record.wins > 0 && <span className="team-performance-chart__segment team-performance-chart__segment--win" style={{ flex: group.record.wins }} />}
								{group.record.losses > 0 && <span className="team-performance-chart__segment team-performance-chart__segment--loss" style={{ flex: group.record.losses }} />}
								{group.record.ties > 0 && <span className="team-performance-chart__segment team-performance-chart__segment--tie" style={{ flex: group.record.ties }} />}
								{group.record.noResults > 0 && <span className="team-performance-chart__segment team-performance-chart__segment--no-result" style={{ flex: group.record.noResults }} />}
							</div>
						</div>
					))}
				</div>
			)}
		</section>
	);
};

const compareMatches = (left: TeamStatsMatch, right: TeamStatsMatch, sortKey: SortKey, sortDir: SortDir): number => {
	let result = 0;
	if (sortKey === 'date') {
		result = parseDateValue(left.date) - parseDateValue(right.date);
	} else {
		const leftValue = (left[sortKey] ?? '').toString().toLowerCase();
		const rightValue = (right[sortKey] ?? '').toString().toLowerCase();
		result = leftValue.localeCompare(rightValue);
	}

	return sortDir === 'asc' ? result : -result;
};

const OutcomeBadge: React.FC<{ outcome: Outcome }> = ({ outcome }) => (
	<span className={`team-stats-badge team-stats-badge--${outcome.toLowerCase().replace(/\s+/g, '-')}`}>
		{outcome}
	</span>
);

export const TeamStatsPage: React.FC = () => {
	const [rows, setRows] = useState<SheetRow[]>([]);
	const [battingHistoryRows, setBattingHistoryRows] = useState<SheetRow[]>([]);
	const [bowlingHistoryRows, setBowlingHistoryRows] = useState<SheetRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [activePerformanceView, setActivePerformanceView] = useState<PerformanceView>('opponents');
	const [searchQuery, setSearchQuery] = useState('');
	const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('All');
	const [sortKey, setSortKey] = useState<SortKey>('date');
	const [sortDir, setSortDir] = useState<SortDir>('desc');

	useEffect(() => {
		setLoading(true);
		setError(null);
		Promise.all([
			fetchSheetData('Team stats'),
			fetchSheetData('Batting History'),
			fetchSheetData('Bowling History'),
		])
			.then(([teamStatsData, battingHistoryData, bowlingHistoryData]) => {
				setRows(teamStatsData);
				setBattingHistoryRows(battingHistoryData);
				setBowlingHistoryRows(bowlingHistoryData);
				setLoading(false);
			})
			.catch((err: Error) => {
				setError(err.message);
				setLoading(false);
			});
	}, []);

	const matches = useMemo(() => {
		return rows
			.map(toTeamStatsMatch)
			.filter((match): match is TeamStatsMatch => match !== null)
			.sort((a, b) => parseDateValue(b.date) - parseDateValue(a.date));
	}, [rows]);

	const summary = useMemo(() => {
		const record = getRecordBreakdown(matches);
		const decidedMatches = record.wins + record.losses;
		const winRate = decidedMatches > 0 ? (record.wins / decidedMatches) * 100 : 0;
		const recentForm = getRecentForm(matches);
		const opponentGroups = groupBy(matches, match => match.opponent);
		const groundGroups = groupBy(matches, match => match.ground);
		const topOpponent = opponentGroups[0] ?? null;
		const topGround = groundGroups[0] ?? null;
		const latestMatch = matches[0] ?? null;
		const latestMatchContext = latestMatch
			? `${formatDate(latestMatch.date)} vs ${latestMatch.opponent}`
			: null;

		let latestMatchTopBatsman: PointsLeader | null = null;
		let latestMatchTopBowler: PointsLeader | null = null;
		let latestMatchTopAllRounder: PointsLeader | null = null;

		const latestMatchDateKey = normalizeDateKey(latestMatch?.date);
		if (latestMatchDateKey) {
			const battingPlayerKey = findPlayerNameKeyFromRow(battingHistoryRows[0]);
			const battingDateKey = findDateKeyFromRow(battingHistoryRows[0]);
			const bowlingPlayerKey = findPlayerNameKeyFromRow(bowlingHistoryRows[0]);
			const bowlingDateKey = findDateKeyFromRow(bowlingHistoryRows[0]);

			const battingPointsByPlayer = new Map<string, number>();
			const bowlingPointsByPlayer = new Map<string, number>();

			if (battingPlayerKey && battingDateKey && battingHistoryRows.length) {
				const battingPointKeys = resolveBattingPointColumnKeys(Object.keys(battingHistoryRows[0]));
				for (const row of battingHistoryRows) {
					if (normalizeDateKey(row[battingDateKey]) !== latestMatchDateKey) {
						continue;
					}

					const player = (row[battingPlayerKey] ?? '').trim();
					if (!player) {
						continue;
					}

					const current = battingPointsByPlayer.get(player) ?? 0;
					battingPointsByPlayer.set(player, current + calculateBattingPoints(row, battingPointKeys));
				}
			}

			if (bowlingPlayerKey && bowlingDateKey && bowlingHistoryRows.length) {
				const bowlingPointKeys = resolveBowlingPointColumnKeys(Object.keys(bowlingHistoryRows[0]));
				for (const row of bowlingHistoryRows) {
					if (normalizeDateKey(row[bowlingDateKey]) !== latestMatchDateKey) {
						continue;
					}

					const player = (row[bowlingPlayerKey] ?? '').trim();
					if (!player) {
						continue;
					}

					const current = bowlingPointsByPlayer.get(player) ?? 0;
					bowlingPointsByPlayer.set(player, current + calculateBowlingPoints(row, bowlingPointKeys));
				}
			}

			latestMatchTopBatsman = topLeaderFromMap(battingPointsByPlayer);
			latestMatchTopBowler = topLeaderFromMap(bowlingPointsByPlayer);

			const aggregateByPlayer = new Map<string, number>();
			for (const [player, points] of battingPointsByPlayer.entries()) {
				aggregateByPlayer.set(player, points);
			}
			for (const [player, points] of bowlingPointsByPlayer.entries()) {
				aggregateByPlayer.set(player, (aggregateByPlayer.get(player) ?? 0) + points);
			}

			latestMatchTopAllRounder = topLeaderFromMap(aggregateByPlayer);
		}

		return {
			totalFixtures: matches.length,
			record,
			decidedMatches,
			winRate,
			recentForm,
			opponentPerformance: toPerformanceGroups(opponentGroups),
			groundPerformance: toPerformanceGroups(groundGroups),
			topOpponent,
			topGround,
			latestMatch,
			latestMatchContext,
			latestMatchTopBatsman,
			latestMatchTopBowler,
			latestMatchTopAllRounder,
		};
	}, [matches, battingHistoryRows, bowlingHistoryRows]);

	const filteredMatches = useMemo(() => {
		const normalizedQuery = searchQuery.trim().toLowerCase();

		return matches.filter(match => {
			const matchesOutcome = outcomeFilter === 'All' || match.outcome === outcomeFilter;
			if (!matchesOutcome) {
				return false;
			}

			if (!normalizedQuery) {
				return true;
			}

			return [match.opponent, match.ground, match.message, match.winnerResult]
				.some(value => value.toLowerCase().includes(normalizedQuery));
		});
	}, [matches, outcomeFilter, searchQuery]);

	const sortedMatches = useMemo(() => {
		return [...filteredMatches].sort((left, right) => compareMatches(left, right, sortKey, sortDir));
	}, [filteredMatches, sortDir, sortKey]);

	const handleSort = (nextSortKey: SortKey) => {
		if (sortKey === nextSortKey) {
			setSortDir(current => current === 'asc' ? 'desc' : 'asc');
			return;
		}

		setSortKey(nextSortKey);
		setSortDir(nextSortKey === 'date' ? 'desc' : 'asc');
	};

	const renderSortArrow = (column: SortKey) => {
		if (sortKey !== column) {
			return ' ↕';
		}
		return sortDir === 'asc' ? ' ↑' : ' ↓';
	};

	return (
		<div className="page">
			<div className="page__header">
				<h2 className="page__title">Team Stats</h2>
				<p className="page__description">Match-level team results from the Team stats sheet, with Dallas Bulls form and venue analysis.</p>
			</div>

			{loading && (
				<div className="page__state">
					<div className="spinner" />
					<span>Loading Team Stats...</span>
				</div>
			)}

			{error && <div className="page__state page__state--error">{error}</div>}

			{!loading && !error && matches.length === 0 && (
				<div className="page__state">No Dallas Bulls fixtures were found in the Team stats sheet.</div>
			)}

			{!loading && !error && matches.length > 0 && (
				<>
					<section className="team-stats-summary" aria-label="Team summary">
						<div className="team-stats-summary__card team-stats-summary__card--record">
							<div className="team-stats-summary__head">
								<div>
									<span className="team-stats-summary__label">Overall Record</span>
									<strong className="team-stats-summary__value">{summary.totalFixtures} Fixtures</strong>
								</div>
								<span className="team-stats-summary__pill">Dallas Bulls</span>
							</div>
							<div className="team-stats-record-table-wrap">
								<table className="team-stats-record-table">
									<thead>
										<tr>
											<th>Win</th>
											<th>Loss</th>
											<th>Tie</th>
											<th>NR</th>
										</tr>
									</thead>
									<tbody>
										<tr>
											<td>{summary.record.wins}</td>
											<td>{summary.record.losses}</td>
											<td>{summary.record.ties}</td>
											<td>{summary.record.noResults}</td>
										</tr>
									</tbody>
								</table>
							</div>
							<span className="team-stats-summary__meta">Complete result split across all recorded team fixtures</span>
						</div>
						<div className="team-stats-summary__card">
							<span className="team-stats-summary__label">Win Rate</span>
							<strong className="team-stats-summary__value">{summary.winRate.toFixed(1)}%</strong>
							<span className="team-stats-summary__meta">Across {summary.decidedMatches} completed matches</span>
						</div>
						<div className="team-stats-summary__card">
							<span className="team-stats-summary__label">Recent Form</span>
							<strong className="team-stats-summary__value team-stats-summary__value--form">
								{summary.recentForm.map((outcome, index) => (
									<span key={`${outcome}-${index}`} className={`team-stats-form team-stats-form--${outcome.toLowerCase().replace(/\s+/g, '-')}`}>
										{toFormToken(outcome)}
									</span>
								))}
							</strong>
							<span className="team-stats-summary__meta">Most recent five fixtures</span>
						</div>
					</section>

					<section className="team-stats-insights" aria-label="Team insights">
						<article className="team-stats-insight">
							<h3 className="team-stats-insight__title">Most Played Opponent</h3>
							<p className="team-stats-insight__value">{summary.topOpponent?.name ?? 'N/A'}</p>
							<p className="team-stats-insight__meta">{summary.topOpponent ? `${summary.topOpponent.matches.length} fixtures` : 'No opponent data'}</p>
						</article>
						<article className="team-stats-insight">
							<h3 className="team-stats-insight__title">Most Used Ground</h3>
							<p className="team-stats-insight__value">{summary.topGround?.name ?? 'N/A'}</p>
							<p className="team-stats-insight__meta">{summary.topGround ? `${summary.topGround.matches.length} fixtures` : 'No ground data'}</p>
						</article>
						<article className="team-stats-insight">
							<h3 className="team-stats-insight__title">Latest Result</h3>
							<p className="team-stats-insight__value">
								{summary.latestMatch ? `${summary.latestMatch.outcome} vs ${summary.latestMatch.opponent}` : 'N/A'}
							</p>
							<p className="team-stats-insight__meta">
								{summary.latestMatch ? `${formatDate(summary.latestMatch.date)} at ${summary.latestMatch.ground}` : 'No latest result available'}
							</p>
						</article>
						<article className="team-stats-insight">
							<h3 className="team-stats-insight__title">Recent Match Top Batsman</h3>
							<p className="team-stats-insight__value">{summary.latestMatchTopBatsman?.player ?? 'N/A'}</p>
							<p className="team-stats-insight__meta">
								{summary.latestMatchTopBatsman
									? `${summary.latestMatchTopBatsman.points} pts • ${summary.latestMatchContext ?? 'Latest match'}`
									: `No batting points found for ${summary.latestMatchContext ?? 'latest match'}`}
							</p>
						</article>
						<article className="team-stats-insight">
							<h3 className="team-stats-insight__title">Recent Match Top Bowler</h3>
							<p className="team-stats-insight__value">{summary.latestMatchTopBowler?.player ?? 'N/A'}</p>
							<p className="team-stats-insight__meta">
								{summary.latestMatchTopBowler
									? `${summary.latestMatchTopBowler.points} pts • ${summary.latestMatchContext ?? 'Latest match'}`
									: `No bowling points found for ${summary.latestMatchContext ?? 'latest match'}`}
							</p>
						</article>
						<article className="team-stats-insight">
							<h3 className="team-stats-insight__title">Recent Match Top Aggregate</h3>
							<p className="team-stats-insight__value">{summary.latestMatchTopAllRounder?.player ?? 'N/A'}</p>
							<p className="team-stats-insight__meta">
								{summary.latestMatchTopAllRounder
									? `${summary.latestMatchTopAllRounder.points} pts (batting + bowling) • ${summary.latestMatchContext ?? 'Latest match'}`
									: `No aggregate points found for ${summary.latestMatchContext ?? 'latest match'}`}
							</p>
						</article>
					</section>

					<section className="team-performance-panel" aria-label="Performance charts">
						<div className="team-performance-panel__tabs" role="tablist" aria-label="Performance views">
							<button
								type="button"
								role="tab"
								aria-selected={activePerformanceView === 'opponents'}
								className={`team-performance-panel__tab${activePerformanceView === 'opponents' ? ' team-performance-panel__tab--active' : ''}`}
								onClick={() => setActivePerformanceView('opponents')}
							>
								Opponent-wise Performance
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={activePerformanceView === 'grounds'}
								className={`team-performance-panel__tab${activePerformanceView === 'grounds' ? ' team-performance-panel__tab--active' : ''}`}
								onClick={() => setActivePerformanceView('grounds')}
							>
								Ground-wise Performance
							</button>
						</div>
						{activePerformanceView === 'opponents' ? (
							<PerformanceChart
								title="Opponent-wise Performance"
								description="Most frequent opponents, ranked by number of fixtures, with record mix and win rate."
								groups={summary.opponentPerformance}
								emptyLabel="No opponent data available."
							/>
						) : (
							<PerformanceChart
								title="Ground-wise Performance"
								description="Most used grounds, showing fixture volume and Dallas Bulls results at each venue."
								groups={summary.groundPerformance}
								emptyLabel="No ground data available."
							/>
						)}
					</section>

					<div className="team-stats-controls">
						<input
							type="text"
							className="player-search-input team-stats-controls__search"
							placeholder="Search by opponent, ground, or result text..."
							value={searchQuery}
							onChange={event => setSearchQuery(event.target.value)}
						/>
						<div className="team-stats-filters" aria-label="Filter by result">
							{(['All', 'Win', 'Loss', 'Tie', 'No Result'] as OutcomeFilter[]).map(filter => (
								<button
									type="button"
									key={filter}
									className={`team-stats-filter${outcomeFilter === filter ? ' team-stats-filter--active' : ''}`}
									onClick={() => setOutcomeFilter(filter)}
								>
									{filter}
								</button>
							))}
						</div>
						<div className="player-search-meta">Showing {sortedMatches.length} of {matches.length} fixtures</div>
					</div>

					<div className="table-wrapper">
						<table className="data-table">
							<thead>
								<tr>
									<th className={`sortable-th${sortKey === 'date' ? ' sort-active' : ''}`} onClick={() => handleSort('date')}>
										Date<span className="sort-arrow">{renderSortArrow('date')}</span>
									</th>
									<th className={`sortable-th${sortKey === 'opponent' ? ' sort-active' : ''}`} onClick={() => handleSort('opponent')}>
										Opponent<span className="sort-arrow">{renderSortArrow('opponent')}</span>
									</th>
									<th className={`sortable-th${sortKey === 'ground' ? ' sort-active' : ''}`} onClick={() => handleSort('ground')}>
										Ground<span className="sort-arrow">{renderSortArrow('ground')}</span>
									</th>
									<th className={`sortable-th${sortKey === 'outcome' ? ' sort-active' : ''}`} onClick={() => handleSort('outcome')}>
										Outcome<span className="sort-arrow">{renderSortArrow('outcome')}</span>
									</th>
									<th>Winner / Result</th>
									<th>Match Summary</th>
								</tr>
							</thead>
							<tbody>
								{sortedMatches.map((match, index) => (
									<tr key={`${match.date}-${match.ground}-${match.opponent}-${index}`} className={index % 2 === 0 ? 'row-even' : 'row-odd'}>
										<td>{formatDate(match.date)}</td>
										<td>{match.opponent || 'Unknown opponent'}</td>
										<td>{match.ground || 'Unknown ground'}</td>
										<td><OutcomeBadge outcome={match.outcome} /></td>
										<td>{match.winnerResult || 'Not recorded'}</td>
										<td className="team-stats-message">{match.message || 'No additional match note recorded.'}</td>
									</tr>
								))}
								{sortedMatches.length === 0 && (
									<tr>
										<td colSpan={6} className="team-stats-empty">No fixtures match the current filter.</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</>
			)}
		</div>
	);
};