const path = require('path');
const webpack = require('webpack');
const pkg = require('./package.json');

require('dotenv').config({ path: path.join(__dirname, '.env.local') });

const googleSheetsApiKey = process.env.GOOGLE_SHEETS_API_KEY || '';

module.exports = (env, argv) => ({
	mode: argv.mode || 'development',
	devtool: argv.mode === 'production' ? false : 'inline-source-map',
	entry: './src/client/browser.tsx',
	output: {
		path: path.join(__dirname, 'out', 'browser'),
		filename: 'browser.js',
		publicPath: '',
	},
	resolve: {
		extensions: ['.ts', '.tsx', '.js', '.jsx', '.css'],
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				loader: 'ts-loader',
				options: {
					transpileOnly: true,
					compilerOptions: {
						noEmit: false,
					},
				},
			},
			{
				test: /\.css$/,
				use: ['style-loader', 'css-loader'],
			},
		],
	},
	plugins: [
		new webpack.DefinePlugin({
			__APP_VERSION__: JSON.stringify(pkg.version),
			__GOOGLE_SHEETS_API_KEY__: JSON.stringify(googleSheetsApiKey),
		}),
	],
});