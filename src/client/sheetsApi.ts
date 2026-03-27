const API_KEY = 'AIzaSyD7ndAm7KSgX-d2kKsA3rbKUMthmvzqkBg';
const SHEET_ID = '1-Sr-asp18tOwusTrs7AksPOwAdI8UfHFYrgong7T1NA';

export interface SheetRow {
	[key: string]: string;
}

export async function fetchSheetData(range = 'Batting Summary'): Promise<SheetRow[]> {
	const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`;

	const response = await fetch(url);
	if (!response.ok) {
		const err = await response.json();
		throw new Error(`Google Sheets API error: ${err.error?.message ?? response.statusText}`);
	}

	const data = await response.json();
	const rows: string[][] = data.values ?? [];

	if (rows.length === 0) {
		return [];
	}

	const headers = rows[0];
	return rows.slice(1).map(row =>
		Object.fromEntries(headers.map((header, i) => [header, row[i] ?? '']))
	);
}
