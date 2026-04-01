import { SheetRow } from './sheetsApi';

export interface BattingPointColumnKeys {
	runsKey?: string;
	foursKey?: string;
	sixesKey?: string;
	strikeRateKey?: string;
	notOutKey?: string;
	dismissalKey?: string;
}

export interface BowlingPointColumnKeys {
	wicketsKey?: string;
	economyKey?: string;
}

const findCol = (headers: string[], patterns: RegExp[]): string | undefined => {
	for (const pattern of patterns) {
		const match = headers.find(header => pattern.test(header.trim()));
		if (match) {
			return match;
		}
	}
	return undefined;
};

const parseNum = (value: string | undefined): number => {
	const parsed = Number.parseFloat((value ?? '').replace(/\*/g, '').trim());
	return Number.isFinite(parsed) ? parsed : 0;
};

const isNotOut = (row: SheetRow, keys: BattingPointColumnKeys): boolean => {
	if (keys.notOutKey) {
		const value = (row[keys.notOutKey] ?? '').toLowerCase().trim();
		return value === 'yes' || value === '1' || value === 'true' || value === 'not out' || value === 'n/o';
	}

	if (keys.dismissalKey) {
		return (row[keys.dismissalKey] ?? '').toLowerCase().includes('not out');
	}

	if (keys.runsKey) {
		return (row[keys.runsKey] ?? '').includes('*');
	}

	return false;
};

const getStrikeRatePoints = (strikeRate: number): number => {
	if (strikeRate < 50) {
		return -10;
	}
	if (strikeRate <= 75) {
		return -5;
	}
	if (strikeRate <= 100) {
		return 0;
	}
	if (strikeRate <= 120) {
		return 5;
	}
	if (strikeRate <= 150) {
		return 10;
	}
	return 20;
};

const getMilestonePoints = (runs: number): number => {
	if (runs >= 100) {
		return 20;
	}
	if (runs >= 75) {
		return 15;
	}
	if (runs >= 50) {
		return 10;
	}
	if (runs >= 30) {
		return 5;
	}
	return 0;
};

export const resolveBattingPointColumnKeys = (headers: string[]): BattingPointColumnKeys => ({
	runsKey: findCol(headers, [/^runs?$/i, /^r$/i, /^score$/i, /runs/i]),
	foursKey: findCol(headers, [/^4s?$/i, /^fours?$/i]),
	sixesKey: findCol(headers, [/^6s?$/i, /^sixes?$/i]),
	strikeRateKey: findCol(headers, [/^sr$/i, /strike\s*rate/i]),
	notOutKey: findCol(headers, [/not[\s_-]?out/i, /^n\/o$/i, /^no$/i]),
	dismissalKey: findCol(headers, [/dismissal/i, /how[\s_-]?out/i]),
});

export const calculateBattingPoints = (row: SheetRow, keys: BattingPointColumnKeys): number => {
	const runs = keys.runsKey ? parseNum(row[keys.runsKey]) : 0;
	const boundaries = keys.foursKey ? parseNum(row[keys.foursKey]) : 0;
	const sixes = keys.sixesKey ? parseNum(row[keys.sixesKey]) : 0;
	const strikeRate = keys.strikeRateKey ? parseNum(row[keys.strikeRateKey]) : null;

	const runPoints = Math.min(runs, 100) + Math.max(runs - 100, 0) * 2;
	const milestonePoints = getMilestonePoints(runs);
	const boundaryPoints = boundaries;
	const sixPoints = sixes * 2;
	const duckPenalty = runs === 0 && !isNotOut(row, keys) ? -5 : 0;
	const strikeRatePoints = strikeRate === null ? 0 : getStrikeRatePoints(strikeRate);

	return runPoints + milestonePoints + boundaryPoints + sixPoints + duckPenalty + strikeRatePoints;
};

const getWicketBonusPoints = (wickets: number): number => {
	if (wickets <= 2) {
		return 0;
	}
	if (wickets === 3) {
		return 5;
	}
	if (wickets === 4) {
		return 10;
	}
	if (wickets === 5) {
		return 20;
	}

	// More than 5 wickets: include 5-wicket bonus and add 10 points per wicket after 5.
	return 20 + (wickets - 5) * 10;
};

const getEconomyPoints = (economy: number): number => {
	if (economy < 3) {
		return 20;
	}
	if (economy < 4) {
		return 15;
	}
	if (economy < 5) {
		return 10;
	}
	if (economy < 6) {
		return 5;
	}
	if (economy < 7) {
		return 0;
	}
	if (economy < 8) {
		return -5;
	}
	if (economy < 9) {
		return -10;
	}
	if (economy < 10) {
		return -15;
	}
	return -20;
};

export const resolveBowlingPointColumnKeys = (headers: string[]): BowlingPointColumnKeys => ({
	wicketsKey: findCol(headers, [/^wkts?$/i, /^wickets?$/i, /^w$/i]),
	economyKey: findCol(headers, [/^econ(omy)?$/i, /economy/i, /^eco$/i]),
});

export const calculateBowlingPoints = (row: SheetRow, keys: BowlingPointColumnKeys): number => {
	const wickets = keys.wicketsKey ? parseNum(row[keys.wicketsKey]) : 0;
	const economy = keys.economyKey ? parseNum(row[keys.economyKey]) : null;

	const wicketPoints = wickets * 20;
	const wicketBonus = getWicketBonusPoints(wickets);
	const economyPoints = economy === null ? 0 : getEconomyPoints(economy);

	return wicketPoints + wicketBonus + economyPoints;
};