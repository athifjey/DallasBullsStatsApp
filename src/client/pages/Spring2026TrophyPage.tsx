import React, { useEffect, useMemo, useState } from 'react';
import { fetchSpring2026TrophyRows, fetchSpring2026TrophySheetTitles } from '../sheetsApi';

interface TrophySection {
	title: string;
	header: string[];
	rows: string[][];
}

interface TrophyEntry {
	award: string;
	player: string;
	team: string;
	stats: string;
	trophyCount: string;
	raw: string[];
}

interface EnrichedTrophySection extends TrophySection {
	entries: TrophyEntry[];
}

const DEFAULT_HEADER = ['Col A', 'Col B', 'Col C', 'Col D', 'Col E', 'Col F'];

const rowText = (row: string[]): string => row.join(' ').trim();
const trimmedRow = (row: string[]): string[] => row.map(cell => cell.trim());
const isEmptyRow = (row: string[]): boolean => trimmedRow(row).every(cell => cell === '');
const normalize = (value: string): string => value.trim().toLowerCase();

const normalizeToSixCols = (row: string[]): string[] => {
	const normalized = [...row.slice(0, 6)];
	while (normalized.length < 6) {
		normalized.push('');
	}
	return normalized;
};

const isSingleCellHeading = (row: string[]): boolean => {
	const nonEmpty = trimmedRow(row).filter(Boolean);
	return nonEmpty.length === 1;
};

const looksLikeHeaderRow = (row: string[]): boolean => {
	const text = rowText(row).toLowerCase();
	if (!text) {
		return false;
	}

	return text.includes('award category')
		|| text.includes('player name')
		|| text.includes('trophy count')
		|| text.includes('individual trophies')
		|| text.includes('stats');
};

const inferBlockTitle = (row: string[] | undefined, fallback: string): string => {
	if (!row) {
		return fallback;
	}

	const firstCell = (row[0] ?? '').trim();
	const text = rowText(row);
	if (firstCell) {
		return firstCell;
	}

	if (text) {
		return text;
	}

	return fallback;
};

const toBlocks = (rows: string[][]): string[][][] => {
	const blocks: string[][][] = [];
	let current: string[][] = [];

	for (const row of rows) {
		if (isEmptyRow(row)) {
			if (current.length > 0) {
				blocks.push(current);
				current = [];
			}
			continue;
		}

		current.push(trimmedRow(row));
	}

	if (current.length > 0) {
		blocks.push(current);
	}

	return blocks;
};

const parseSections = (rows: string[][]): TrophySection[] => {
	const blocks = toBlocks(rows);
	const sections: TrophySection[] = [];
	let pendingTitle: string | null = null;
	let pendingHeader: string[] | null = null;

	for (let index = 0; index < blocks.length; index += 1) {
		const block = blocks[index];
		if (block.length === 1 && isSingleCellHeading(block[0])) {
			pendingTitle = rowText(block[0]);
			continue;
		}

		const fallbackTitle = `Section ${sections.length + 1}`;
		const title = pendingTitle ?? inferBlockTitle(block[0], fallbackTitle);
		pendingTitle = null;

		let header = pendingHeader;
		pendingHeader = null;

		let dataRows = block;
		const headerIndex = block.findIndex(row => looksLikeHeaderRow(row));
		if (headerIndex >= 0) {
			const detectedHeader = normalizeToSixCols(block[headerIndex]);
			const remainingRows = block.slice(headerIndex + 1);

			if (remainingRows.length === 0) {
				pendingTitle = title;
				pendingHeader = detectedHeader;
				continue;
			}

			header = detectedHeader;
			dataRows = remainingRows;
		}

		if (!header) {
			header = DEFAULT_HEADER;
		}

		const normalizedRows = dataRows
			.filter(row => !isEmptyRow(row))
			.map(normalizeToSixCols);

		if (normalizedRows.length === 0) {
			continue;
		}

		sections.push({
			title,
			header,
			rows: normalizedRows,
		});
	}

	return sections;
};

const toEntries = (section: TrophySection): TrophyEntry[] => {
	const headers = section.header.map(cell => normalize(cell));
	const findIndex = (candidates: string[]): number => {
		for (const candidate of candidates) {
			const index = headers.findIndex(header => header.includes(candidate));
			if (index >= 0) {
				return index;
			}
		}
		return -1;
	};

	const awardIndex = findIndex(['award category']);
	const playerIndex = findIndex(['player name', 'player']);
	const teamIndex = findIndex(['team']);
	const statsIndex = findIndex(['stats']);
	const countIndex = findIndex(['trophy count', 'count']);

	return section.rows.map(row => {
		const get = (index: number, fallbackIndex: number): string => {
			if (index >= 0 && index < row.length) {
				return row[index] ?? '';
			}
			return row[fallbackIndex] ?? '';
		};

		return {
			award: get(awardIndex, 0),
			player: get(playerIndex, 1),
			team: get(teamIndex, 2),
			stats: get(statsIndex, 3),
			trophyCount: get(countIndex, 4),
			raw: row,
		};
	}).filter(entry => Object.values(entry).some(value => typeof value === 'string' && value.trim() !== ''));
};

const entryDisplayName = (entry: TrophyEntry): string => {
	if (entry.player.trim()) {
		return entry.player;
	}
	if (entry.team.trim()) {
		return entry.team;
	}
	return 'N/A';
};

const isWinnerAward = (award: string): boolean => normalize(award) === 'champion';
const isRunnerAward = (award: string): boolean => normalize(award) === 'runner-up';

const isIndividualAward = (award: string): boolean => {
	const value = normalize(award);
	if (!value) {
		return false;
	}
	if (isWinnerAward(award) || isRunnerAward(award)) {
		return false;
	}
	if (value.includes('total trophy count')) {
		return false;
	}
	return true;
};

export const Spring2026TrophyPage: React.FC = () => {
	const [tabTitles, setTabTitles] = useState<string[]>([]);
	const [rowsByTab, setRowsByTab] = useState<Record<string, string[][]>>({});
	const [activeTab, setActiveTab] = useState('');
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setLoading(true);
		setError(null);

		fetchSpring2026TrophySheetTitles()
			.then(async titles => {
				if (titles.length === 0) {
					setTabTitles([]);
					setRowsByTab({});
					setActiveTab('');
					setLoading(false);
					return;
				}

				setTabTitles(titles);
				setActiveTab(current => current && titles.includes(current) ? current : titles[0]);

				const entries = await Promise.all(titles.map(async title => {
					const rows = await fetchSpring2026TrophyRows(title);
					return [title, rows] as const;
				}));

				setRowsByTab(Object.fromEntries(entries));
				setLoading(false);
			})
			.catch((err: Error) => {
				setError(err.message);
				setLoading(false);
			});
	}, []);

	const activeRows = rowsByTab[activeTab] ?? [];

	const insight = useMemo(() => {
		const rows = activeRows;
		const nonEmptyRows = rows.filter(row => row.some(cell => cell.trim() !== ''));
		const markerRows = nonEmptyRows.filter(row => {
			const text = rowText(row).toLowerCase();
			return text.includes('spring') || text.includes('troph') || text.includes('award category');
		});
		const sections = parseSections(rows);
		const enrichedSections: EnrichedTrophySection[] = sections.map(section => ({
			...section,
			entries: toEntries(section),
		}));

		const winnerRunnerSection = enrichedSections.find(section =>
			section.entries.some(entry => isWinnerAward(entry.award))
			&& section.entries.some(entry => isRunnerAward(entry.award))
		);

		const winnerEntry = winnerRunnerSection?.entries.find(entry => isWinnerAward(entry.award)) ?? null;
		const runnerEntry = winnerRunnerSection?.entries.find(entry => isRunnerAward(entry.award)) ?? null;

		const explicitIndividualSection = enrichedSections.find(section => /individual/i.test(section.title));
		const individualEntries = (explicitIndividualSection?.entries ?? enrichedSections.flatMap(section => section.entries))
			.filter(entry => isIndividualAward(entry.award));

		const restSections = enrichedSections.filter(section => section !== winnerRunnerSection && section !== explicitIndividualSection && section.entries.length > 0);

		return {
			totalRows: rows.length,
			nonEmptyRows: nonEmptyRows.length,
			markerRows: markerRows.length,
			sections: enrichedSections,
			winnerEntry,
			runnerEntry,
			individualEntries,
			restSections,
		};
	}, [activeRows]);

	return (
		<div className="page">
			<div className="page__header">
				<h2 className="page__title">Spring 2026 Trophy</h2>
				<p className="page__description">
					Connected to sheet ID 1XDdjYXRYC5hmVZYmwaM-cecZFZh7K0Lbac_uLiq3-dI (tab: Sheet1). Data is loaded and ready for final visual design.
				</p>
			</div>

			{loading && (
				<div className="page__state">
					<div className="spinner" />
					<span>Loading Spring 2026 Trophy data...</span>
				</div>
			)}

			{error && <div className="page__state page__state--error">{error}</div>}

			{!loading && !error && (
				<>
					{tabTitles.length > 0 && (
						<div className="trophy-tabs" role="tablist" aria-label="Spring 2026 Trophy sheets">
							{tabTitles.map(title => (
								<button
									type="button"
									key={title}
									role="tab"
									aria-selected={activeTab === title}
									className={`trophy-tabs__item${activeTab === title ? ' trophy-tabs__item--active' : ''}`}
									onClick={() => setActiveTab(title)}
								>
									{title}
								</button>
							))}
						</div>
					)}

					<div className="player-search-meta trophy-meta">
						Rows: {insight.totalRows} | Non-empty rows: {insight.nonEmptyRows} | Section markers: {insight.markerRows} | Parsed sections: {insight.sections.length}
					</div>

					<div className="trophy-widgets" role="tabpanel" aria-label={activeTab || 'Spring 2026 Trophy'}>
						<div className="trophy-hero-widgets">
							<section className="trophy-widget trophy-widget--winner">
								<div className="trophy-widget__label">Winner</div>
								<div className="trophy-widget__name trophy-widget__name--winner">
									{insight.winnerEntry ? entryDisplayName(insight.winnerEntry) : 'N/A'}
								</div>
								{insight.winnerEntry && (
									<div className="trophy-widget__meta">
										<span>{insight.winnerEntry.award}</span>
										<span>{insight.winnerEntry.trophyCount ? `Count: ${insight.winnerEntry.trophyCount}` : ''}</span>
									</div>
								)}
							</section>

							<section className="trophy-widget trophy-widget--runner">
								<div className="trophy-widget__label">Runner-Up</div>
								<div className="trophy-widget__name trophy-widget__name--runner">
									{insight.runnerEntry ? entryDisplayName(insight.runnerEntry) : 'N/A'}
								</div>
								{insight.runnerEntry && (
									<div className="trophy-widget__meta">
										<span>{insight.runnerEntry.award}</span>
										<span>{insight.runnerEntry.trophyCount ? `Count: ${insight.runnerEntry.trophyCount}` : ''}</span>
									</div>
								)}
							</section>
						</div>

						<section className="trophy-widget trophy-widget--full">
							<div className="trophy-card__head">
								<h3 className="trophy-card__title">Individual Awards</h3>
								<span className="trophy-card__count">{insight.individualEntries.length} entries</span>
							</div>
							<div className="trophy-awards-grid">
								{insight.individualEntries.map((entry, index) => (
									<article key={`individual-award-${index}`} className="trophy-award-card">
										<div className="trophy-award-card__title">{entry.award}</div>
										<div className="trophy-award-card__name">{entryDisplayName(entry)}</div>
										<div className="trophy-award-card__meta">
											{entry.stats && <span>{entry.stats}</span>}
											{entry.trophyCount && <span>Count: {entry.trophyCount}</span>}
										</div>
									</article>
								))}
								{insight.individualEntries.length === 0 && (
									<div className="dashboard-card__empty">No individual awards found for this tab.</div>
								)}
							</div>
						</section>

						{insight.restSections.map((section, sectionIndex) => (
							<section key={`rest-section-${sectionIndex}`} className="trophy-widget trophy-widget--full">
								<div className="trophy-card__head">
									<h3 className="trophy-card__title">{section.title}</h3>
									<span className="trophy-card__count">{section.entries.length} entries</span>
								</div>
								<div className="trophy-awards-grid">
									{section.entries.map((entry, entryIndex) => (
										<article key={`rest-entry-${sectionIndex}-${entryIndex}`} className="trophy-award-card">
											<div className="trophy-award-card__title">{entry.award || 'Category'}</div>
											<div className="trophy-award-card__name">{entryDisplayName(entry)}</div>
											<div className="trophy-award-card__meta">
												{entry.stats && <span>{entry.stats}</span>}
												{entry.trophyCount && <span>Count: {entry.trophyCount}</span>}
											</div>
										</article>
									))}
								</div>
							</section>
						))}

						{insight.sections.length === 0 && (
							<section className="trophy-card">
								<div className="dashboard-card__empty">No section data found for this tab.</div>
							</section>
						)}
					</div>
				</>
			)}
		</div>
	);
};
