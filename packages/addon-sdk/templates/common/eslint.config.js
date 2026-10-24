import tseslint from 'typescript-eslint';

// oss!idle refuses an add-on whose built file can run code players cannot read: text turned
// into code, or code loaded from elsewhere. It checks the bundle when you publish;
// `npm run lint` tells you sooner, in your own code.
const NOT_READABLE = 'oss!idle refuses code that runs what players cannot read';

export default tseslint.config(
	{ ignores: ['dist/', 'node_modules/'] },
	{
		files: ['**/*.{js,jsx,mjs,ts,tsx,mts}'],
		languageOptions: {
			parser: tseslint.parser,
			// no-implied-eval only knows the timers as globals
			globals: Object.fromEntries(['window', 'self', 'globalThis', 'setTimeout', 'setInterval']
				.map(name => [name, 'readonly'])),
		},
		rules: {
			'no-eval': 'error',
			'no-implied-eval': 'error',
			'no-new-func': 'error',
			'no-script-url': 'error',
			'no-restricted-globals': ['error', 'eval', 'Function', 'importScripts'],
			'no-restricted-properties': ['error',
				{ object: 'document', property: 'write', message: NOT_READABLE },
				{ object: 'document', property: 'writeln', message: NOT_READABLE },
				{ property: 'eval', message: NOT_READABLE },
				{ property: 'Function', message: NOT_READABLE },
				{ property: 'srcdoc', message: NOT_READABLE },
				{ property: 'createContextualFragment', message: NOT_READABLE },
				{ property: 'serviceWorker', message: NOT_READABLE },
			],
			'no-restricted-syntax': ['error',
				{ selector: 'ImportExpression', message: `import() loads code from elsewhere: ${NOT_READABLE}` },
				{
					selector: 'ImportDeclaration[source.value=/^([a-z]+:|\\/\\/)/i]',
					message: `Imports from an address load code from elsewhere: ${NOT_READABLE}`,
				},
				{
					selector: 'CallExpression[callee.property.name=/^createElement(NS)?$/] > Literal[value=/^\\s*script\\s*$/i]',
					message: `A script element loads or runs code: ${NOT_READABLE}`,
				},
				{
					selector: 'CallExpression[callee.property.name=/^setAttribute(NS)?$/] > Literal[value=/^on/i]',
					message: `An on… attribute runs its text as code: use addEventListener. ${NOT_READABLE}`,
				},
				{
					selector: 'CallExpression[callee.property.name="constructor"], NewExpression[callee.property.name="constructor"]',
					message: `A function's constructor builds code from text: ${NOT_READABLE}`,
				},
			],
		},
	},
);
