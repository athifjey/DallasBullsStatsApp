import React, { useEffect, useState } from 'react';
import { fetchSheetData, SheetRow } from './sheetsApi';

interface SheetPageProps {
	sheetName: string;
	title: string;
	description?: string;
}

export const SheetPage: React.FC<SheetPageProps> = ({ sheetName, title, description }) => {
	const [rows, setRows] = useState<SheetRow[]>([]);
	const [headers, setHeaders] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		setLoading(true);
		setError(null);
		fetchSheetData(sheetName)
			.then(data => {
				setRows(data);
				setHeaders(data.length > 0 ? Object.keys(data[0]) : []);
				setLoading(false);
			})
			.catch(err => {
				setError(err.message);
				setLoading(false);
			});
	}, [sheetName]);

	return (
		<div className="page">
			<div className="page__header">
				<h2 className="page__title">{title}</h2>
				{description && <p className="page__description">{description}</p>}
			</div>

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
									<th key={h}>{h}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((row, i) => (
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
