import React from 'react';
import { SheetPage } from '../SheetPage';

export const BowlingSummaryPage: React.FC = () => (
	<SheetPage
		sheetName="Bowling Summary"
		title="Bowling Summary"
		description="Overall bowling statistics for all players."
		defaultSortKey="Wickets"
		defaultSortDir="desc"
	/>
);
