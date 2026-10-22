import tseslint from 'typescript-eslint';

// oss!idle refuses an add-on whose built file can run code nobody reviewed: text turned
// into code, or code loaded from elsewhere. It checks the bundle when you publish;
// `npm run lint` tells you sooner, in your own code.
const NOT_REVIEWED = 'oss!idle refuses code that runs what was not reviewed';

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
				{ object: 'document', property: 'write', message: NOT_REVIEWED },
				{ object: 'document', property: 'writeln', message: NOT_REVIEWED },
				{ property: 'eval', message: NOT_REVIEWED },
				{ property: 'Function', message: NOT_REVIEWED },
				{ property: 'srcdoc', message: NOT_REVIEWED },
				{ property: 'createContextualFragment', message: NOT_REVIEWED },
				{ property: 'serviceWorker', message: NOT_REVIEWED },
			],
			'no-restricted-syntax': ['error',
				{ selector: 'ImportExpression', message: `import() loads code from elsewhere: ${NOT_REVIEWED}` },
				{
					selector: 'ImportDeclaration[source.value=/^([a-z]+:|\\/\\/)/i]',
					message: `Imports from an address load code from elsewhere: ${NOT_REVIEWED}`,
				},
				{
					selector: 'CallExpression[callee.property.name=/^createElement(NS)?$/] > Literal[value=/^\\s*script\\s*$/i]',
					message: `A script element loads or runs code: ${NOT_REVIEWED}`,
				},
				{
					selector: 'CallExpression[callee.property.name=/^setAttribute(NS)?$/] > Literal[value=/^on/i]',
					message: `An on… attribute runs its text as code: use addEventListener. ${NOT_REVIEWED}`,
				},
				{
					selector: 'CallExpression[callee.property.name="constructor"], NewExpression[callee.property.name="constructor"]',
					message: `A function's constructor builds code from text: ${NOT_REVIEWED}`,
				},
			],
		},
	},
);
