const API_KEY = __GOOGLE_SHEETS_API_KEY__;
const SHEET_ID = '1-Sr-asp18tOwusTrs7AksPOwAdI8UfHFYrgong7T1NA';
const SCHEDULE_SHEET_ID = '1PfbsptzwETTMn-jdi0l0UO-SjASaccHrMcG7qZxTI7E';

export interface SheetRow {
	[key: string]: string;
}

const fetchSheetRows = async (sheetId: string, range: string): Promise<SheetRow[]> => {
	if (!API_KEY) {
		throw new Error('Google Sheets API key is not configured for this build.');
	}

	const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${API_KEY}`;

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
};

export async function fetchSheetData(range = 'Batting Summary'): Promise<SheetRow[]> {
	return fetchSheetRows(SHEET_ID, range);
}

export async function fetchScheduleData(range = 'Schedule'): Promise<SheetRow[]> {
	return fetchSheetRows(SCHEDULE_SHEET_ID, range);
}
