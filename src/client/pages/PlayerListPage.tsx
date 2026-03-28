import React, { useEffect, useMemo, useState } from 'react';
import { fetchSheetData, SheetRow } from '../sheetsApi';

const URL_COL_PATTERN = /url|link|profile/i;
const NAME_COL_PATTERN = /name|player/i;
const isUrl = (val: string) => /^https?:\/\//i.test(val.trim());

export const PlayerListPage: React.FC = () => {
	const [rows, setRows] = useState<SheetRow[]>([]);
	const [headers, setHeaders] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState('');

	useEffect(() => {
		setLoading(true);
		setError(null);
		fetchSheetData('Player list')
			.then(data => {
				setRows(data);
				setHeaders(data.length > 0 ? Object.keys(data[0]) : []);
				setLoading(false);
			})
			.catch(err => {
				setError(err.message);
				setLoading(false);
			});
	}, []);

	const isUrlCol = (col: string, rows: SheetRow[]) =>
		URL_COL_PATTERN.test(col) || rows.some(r => isUrl(r[col] ?? ''));

	const nameCol = useMemo(() =>
		headers.find(h => NAME_COL_PATTERN.test(h)) ?? headers[0],
		[headers]
	);

	const processedRows = useMemo(() => {
		const sorted = [...rows].sort((a, b) =>
			(a[nameCol] ?? '').localeCompare(b[nameCol] ?? '')
		);
		if (!search.trim()) return sorted;
		const q = search.toLowerCase();
		return sorted.filter(r => (r[nameCol] ?? '').toLowerCase().includes(q));
	}, [rows, nameCol, search]);

	return (
		<div className="page">
			<div className="page__header">
				<h2 className="page__title">Player List</h2>
				<p className="page__description">Full list of registered players.</p>
			</div>

			{loading && (
				<div className="page__state">
					<div className="spinner" />
					<span>Loading Player List...</span>
				</div>
			)}

			{error && (
				<div className="page__state page__state--error">⚠️ {error}</div>
			)}

			{!loading && !error && rows.length === 0 && (
				<div className="page__state">No data found in this sheet.</div>
			)}

			{!loading && !error && rows.length > 0 && (
				<>
					<div className="player-search-wrap">
						<input
							type="text"
							className="player-search-input"
							placeholder="Search players…"
							value={search}
							onChange={e => setSearch(e.target.value)}
						/>
						<span className="player-search-count">
							{processedRows.length} of {rows.length} players
						</span>
					</div>
					<div className="table-wrapper">
						<table className="data-table">
							<thead>
								<tr>
									{headers.map(h => (
										<th key={h}>{isUrlCol(h, rows) ? 'DCL Profile' : h}</th>
									))}
								</tr>
							</thead>
							<tbody>
								{processedRows.map((row, i) => (
									<tr key={i} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
										{headers.map(h => {
											const val = row[h] ?? '';
											if (isUrlCol(h, rows) && isUrl(val)) {
												return (
													<td key={h}>
														<a
															href={val}
															target="_blank"
															rel="noreferrer"
															className="dcl-profile-btn"
														>
															DCL Profile Link
														</a>
													</td>
												);
											}
											return <td key={h}>{val}</td>;
										})}
									</tr>
								))}
								{processedRows.length === 0 && (
									<tr>
										<td colSpan={headers.length} style={{ textAlign: 'center', color: '#888' }}>
											No players match "{search}"
										</td>
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
