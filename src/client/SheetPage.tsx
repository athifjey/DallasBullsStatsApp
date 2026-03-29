import React, { useEffect, useMemo, useState } from 'react';
import { fetchSheetData, SheetRow } from './sheetsApi';

interface SheetPageProps {
	sheetName: string;
	title: string;
	description?: string;
	defaultSortKey?: string;
	defaultSortDir?: SortDir;
	banner?: React.ReactNode;
}

type SortDir = 'asc' | 'desc';

export const SheetPage: React.FC<SheetPageProps> = ({ sheetName, title, description, defaultSortKey, defaultSortDir, banner }) => {
	const [rows, setRows] = useState<SheetRow[]>([]);
	const [headers, setHeaders] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [sortKey, setSortKey] = useState<string | null>(null);
	const [sortDir, setSortDir] = useState<SortDir>('asc');

	useEffect(() => {
		setLoading(true);
		setError(null);
		setSortKey(null);
		setSortDir('asc');
		fetchSheetData(sheetName)
			.then(data => {
				setRows(data);
				const cols = data.length > 0 ? Object.keys(data[0]) : [];
				setHeaders(cols);
				if (defaultSortKey) {
					const match = cols.find(c => c.toLowerCase().includes(defaultSortKey.toLowerCase()));
					if (match) {
						setSortKey(match);
						setSortDir(defaultSortDir ?? 'asc');
					}
				}
				setLoading(false);
			})
			.catch(err => {
				setError(err.message);
				setLoading(false);
			});
	}, [sheetName]);

	const handleSort = (col: string) => {
		if (sortKey === col) {
			setSortDir(d => d === 'asc' ? 'desc' : 'asc');
		} else {
			setSortKey(col);
			setSortDir('asc');
		}
	};

	const sortedRows = useMemo(() => {
		if (!sortKey) return rows;
		return [...rows].sort((a, b) => {
			const av = a[sortKey] ?? '';
			const bv = b[sortKey] ?? '';
			const an = parseFloat(av);
			const bn = parseFloat(bv);
			let cmp: number;
			if (!isNaN(an) && !isNaN(bn)) {
				cmp = an - bn;
			} else {
				cmp = av.localeCompare(bv);
			}
			return sortDir === 'asc' ? cmp : -cmp;
		});
	}, [rows, sortKey, sortDir]);

	return (
		<div className="page">
			<div className="page__header">
				<h2 className="page__title">{title}</h2>
				{description && <p className="page__description">{description}</p>}
			</div>

			{banner}

			{loading && (
				<div className="page__state">
					<div className="spinner" />
					<span>Loading {title}...</span>
				</div>
			)}

			{error && (
				<div className="page__state page__state--error">
					⚠️ {error}
				</div>
			)}

			{!loading && !error && rows.length === 0 && (
				<div className="page__state">No data found in this sheet.</div>
			)}

			{!loading && !error && rows.length > 0 && (
				<div className="table-wrapper">
					<table className="data-table">
						<thead>
							<tr>
								{headers.map(h => (
									<th
										key={h}
										className={`sortable-th${sortKey === h ? ' sort-active' : ''}`}
										onClick={() => handleSort(h)}
									>
										{h}
										<span className="sort-arrow">
											{sortKey === h ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
										</span>
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{sortedRows.map((row, i) => (
								<tr key={i} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
									{headers.map(h => (
										<td key={h}>{row[h]}</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
};
