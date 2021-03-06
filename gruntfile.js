const fs = require('fs');
const path = require('path');
const helpers = require('./build/helpers');
const i18n = require('./build/i18n');

const distFolder = path.join(__dirname, '/dist');
if (!fs.existsSync(distFolder)) {
	fs.mkdirSync(distFolder);
}

const workersFolder = path.join(__dirname, '/dist/workers');
if (!fs.existsSync(workersFolder)) {
	fs.mkdirSync(workersFolder);
}

// stored in memory here. For the dev environment, changes to web worker files are watched and built separately,
// then this object is updated with the change & the final map file is regenerated. For prod it's just done in
// one go
const webWorkerMap = {
	coreWorker: '',
	coreDataTypeWorker: '',
	coreExportTypeWorker: '',
	workerUtils: '',
	dataTypes: {},
	exportTypes: {},
	countries: {}
};

module.exports = function (grunt) {
	const dataTypesFolder = 'src/plugins/dataTypes';
	const exportTypesFolder = 'src/plugins/exportTypes';
	const countriesFolder = 'src/plugins/countries';
	const locales = ['de', 'en', 'es', 'fr', 'ja', 'nl', 'ta', 'zh'];

	const generateI18nBundles = () => {
		locales.forEach((locale) => {
			const coreLocaleStrings = JSON.parse(fs.readFileSync(`src/i18n/${locale}.json`, 'utf8'));
			const dtImports = getPluginLocaleFiles(grunt, locale, dataTypesFolder);
			const etImports = getPluginLocaleFiles(grunt, locale, exportTypesFolder);
			const countryImports = getPluginLocaleFiles(grunt, locale, countriesFolder);

			generateLocaleFileTemplate(locale, coreLocaleStrings, dtImports, etImports, countryImports);
		});
	};

	const getPluginLocaleFiles = (grunt, locale, pluginTypeFolder) => {
		const plugins = fs.readdirSync(pluginTypeFolder);
		const imports = {};
		plugins.forEach((folder) => {
			const localeFile = `${pluginTypeFolder}/${folder}/i18n/${locale}.json`;
			if (fs.existsSync(localeFile)) {
				try {
					imports[folder] = JSON.parse(fs.readFileSync(localeFile, 'utf8'));
				} catch (e) {
					grunt.fail.fatal('problem parsing i18n file: ' + localeFile);
				}
			}
		});
		return imports;
	};

	const generateLocaleFileTemplate = (locale, coreLocaleStrings, dtImports, etImports, countryImports) => {
		const template = `// DO NOT EDIT. This file is generated by a Grunt task.
// ----------------------------------------------------

(function() { 
const i18n = {
	core: ${JSON.stringify(coreLocaleStrings)},
	dataTypes: ${JSON.stringify(dtImports)},
	exportTypes: ${JSON.stringify(etImports)},
	countries: ${JSON.stringify(countryImports)}
};

// load the locale info via an exposed global
window.gd.localeLoaded(i18n);
})();`;

		fs.writeFileSync(`./dist/${locale}.js`, template);
	};

	// looks through the plugins and finds the plugins that have a generator web worker file
	const dataTypeWebWorkerMap = (() => {
		const baseFolder = path.join(__dirname, `/src/plugins/dataTypes`);
		const folders = fs.readdirSync(baseFolder);

		const map = {};
		folders.forEach((folder) => {
			const webworkerFile = path.join(__dirname, `/src/plugins/dataTypes/${folder}/${folder}.generator.ts`);
			if (!fs.existsSync(webworkerFile)) {
				return;
			}
			map[`dist/workers/DT-${folder}.generator.js`] = [`src/plugins/dataTypes/${folder}/${folder}.generator.ts`];
		});

		return map;
	})();

	const exportTypeWebWorkerMap = (() => {
		const baseFolder = path.join(__dirname, `/src/plugins/exportTypes`);
		const folders = fs.readdirSync(baseFolder);

		const map = {};
		folders.forEach((folder) => {
			const webworkerFile = path.join(__dirname, `/src/plugins/exportTypes/${folder}/${folder}.generator.ts`);
			if (!fs.existsSync(webworkerFile)) {
				return;
			}
			map[`dist/workers/ET-${folder}.generator.js`] = [`src/plugins/exportTypes/${folder}/${folder}.generator.ts`];
		});

		return map;
	})();

	const countryWebWorkerMap = (() => {
		const baseFolder = path.join(__dirname, `/src/plugins/countries`);
		const folders = fs.readdirSync(baseFolder);

		const map = {};
		folders.forEach((folder) => {
			const webworkerFile = path.join(__dirname, `/src/plugins/countries/${folder}/bundle.ts`);
			if (!fs.existsSync(webworkerFile)) {
				return;
			}
			map[`dist/workers/C-${folder}.js`] = [`src/plugins/countries/${folder}/bundle.ts`];
		});

		return map;
	})();

	const webWorkerFileListWithType = [
		{ file: 'src/core/generator/dataTypes.worker.ts', type: 'core' },
		{ file: 'src/core/generator/exportTypes.worker.ts', type: 'core' },
		{ file: 'src/utils/workerUtils.ts', type: 'core' }
	];
	Object.values(dataTypeWebWorkerMap).forEach((dt) => {
		webWorkerFileListWithType.push({ file: dt[0], type: 'dataType' });
	});
	Object.values(exportTypeWebWorkerMap).forEach((et) => {
		webWorkerFileListWithType.push({ file: et[0], type: 'exportType' });
	});
	Object.values(countryWebWorkerMap).forEach((c) => {
		webWorkerFileListWithType.push({ file: c[0], type: 'country' });
	});

	const webWorkerFileList = webWorkerFileListWithType.map((i) => i.file);

	const generateWorkerMapFile = () => {
		fs.writeFileSync(`./src/_pluginWebWorkers.ts`, `export default ${JSON.stringify(webWorkerMap, null, '\t')};`);
	};

	const getWebWorkerShellCommands = (omitFiles = {}) => {
		const commands = {};

		webWorkerFileListWithType.forEach(({ file, type }, index) => {
			if (omitFiles[file]) {
				// console.log("worker file: ", file, " is unchanged. Omitting regeneration.");
				return;
			}

			const filename = path.basename(file, path.extname(file));
			let target = `dist/workers/${filename}.js`;

			if (['dataType', 'exportType', 'country'].indexOf(type) !== -1) {
				const filename = helpers.getScopedWorkerFilename(file, type);
				target = `dist/workers/${filename}`;
			}

			commands[`buildWebWorker${index}`] = {
				command: `npx rollup -c --config-src=${file} --config-target=${target}`
			};
		});

		return commands;
	};

	// generating every web worker bundle takes time. To get around that, rollup generates a file in the dist/workers
	// file for each bundle, with the filename of form:
	//      Plugins (e.g.):
	//          __hash-DT-Alphanumeric.generator
	//          __hash-ET-JSON.generator
	//          __hash-C-Pakistan.generator
	//
	//      Core workers:
	//          __hash-core.worker
	//          __hash-dataTypes.worker
	//          __hash-exportTypes.worker
	//          __hash-workerUtils
	// we then use that information here to check to see if we need to regenerate or not
	const getWebWorkerBuildCommandNames = () => {

		const omitFiles = {};
		webWorkerFileListWithType.forEach(({ file, type }) => {
			const filename = helpers.getScopedWorkerFilename(file, type);
			const filenameHash = helpers.getHashFilename(filename);

			if (!helpers.hasWorkerFileChanged(`${workersFolder}/${filename}`, `${workersFolder}/${filenameHash}`)) {
				omitFiles[file] = true;
			}
		});

		return Object.keys(getWebWorkerShellCommands(omitFiles)).map((cmdName) => `shell:${cmdName}`);
	};

	const webWorkerWatchers = (() => {
		const tasks = {};

		// this contains *ALL* web worker tasks. It ensures that everything is watched.
		webWorkerFileList.forEach((workerPath, index) => {
			tasks[`webWorkerWatcher${index}`] = {
				files: [workerPath],
				options: { spawn: false },
				tasks: [`shell:buildWebWorker${index}`, `md5:webWorkerMd5Task${index}`, 'generateWorkerMapFile']
			};
		});

		return tasks;
	})();

	const processMd5Change = (fileChanges) => {
		const oldPath = fileChanges[0].oldPath;
		const oldFile = path.basename(oldPath);
		const newFilename = path.basename(fileChanges[0].newPath);

		if (oldPath === 'dist/workers/core.worker.js') {
			webWorkerMap.coreWorker = newFilename;
		} else if (oldPath === 'dist/workers/dataTypes.worker.js') {
			webWorkerMap.coreDataTypeWorker = newFilename;
		} else if (oldPath === 'dist/workers/exportTypes.worker.js') {
			webWorkerMap.coreExportTypeWorker = newFilename;
		} else if (oldPath === 'dist/workers/workerUtils.js') {
			webWorkerMap.workerUtils = newFilename;
		} else {
			const [pluginFolder] = oldFile.split('.');
			const cleanPluginFolder = pluginFolder.replace(/^(DT-|ET-|C-)/, '');

			if (/^DT-/.test(oldFile)) {
				webWorkerMap.dataTypes[cleanPluginFolder] = newFilename;
			} else if (/^ET-/.test(oldFile)) {
				webWorkerMap.exportTypes[cleanPluginFolder] = newFilename;
			} else {
				const countryFolder = path.basename(oldPath, path.extname(oldPath)).replace(/(C-)/, '');
				webWorkerMap.countries[countryFolder] = newFilename;
			}
		}
	};

	// these tasks execute individually AFTER the worker has already been generated in the dist/workers folder
	const webWorkerMd5Tasks = (() => {
		const tasks = {};
		webWorkerFileListWithType.forEach(({ file, type }, index) => {
			const fileName = helpers.getScopedWorkerFilename(file, type);
			const newFileLocation = `dist/workers/${fileName}`; // N.B. here it's now a JS file, not TS

			tasks[`webWorkerMd5Task${index}`] = {
				files: {
					[newFileLocation]: newFileLocation
				},
				options: {
					after: (fileChanges) => processMd5Change(fileChanges, webWorkerMap)
				}
			};
		});

		return tasks;
	})();

	const getWebWorkerMd5TaskNames = () => {
		return Object.keys(webWorkerMd5Tasks).map((cmdName) => `md5:${cmdName}`);
	};

	grunt.initConfig({
		cssmin: {
			options: {
				mergeIntoShorthands: false,
				roundingPrecision: -1
			},
			target: {
				files: {
					'dist/styles.css': [
						'src/resources/codemirror.css',
						'src/resources/ambience.css',
						'src/resources/cobalt.css',
						'src/resources/darcula.css',
						'src/resources/lucario.css'
					]
				}
			}
		},

		copy: {
			main: {
				files: [
					{
						expand: true,
						cwd: 'src/images',
						src: ['*'],
						dest: 'dist/images/'
					}
				]
			},

			codeMirrorModes: {
				files: [
					{
						expand: true,
						cwd: 'node_modules/codemirror/mode',
						src: ['**/*'],
						dest: 'dist/codeMirrorModes/'
					}
				]
			}
		},

		clean: {
			dist: ['dist']
		},

		shell: {
			webpackProd: {
				command: 'yarn prod'
			},

			// note these aren't executed right away, so they contain ALL web workers, even those don't need regeneration
			...getWebWorkerShellCommands()
		},

		watch: {
			...webWorkerWatchers
		},

		md5: {
			...webWorkerMd5Tasks
		}
	});

	const validateI18n = () => {
		const baseLocale = grunt.option('baseLocale') || 'en';
		const targetLocale = grunt.option('locale') || null;
		const targetDataType = grunt.option('dataType') || null;
		const targetExportType = grunt.option('exportType') || null;

		let errors = '';
		if (targetDataType) {
			errors += i18n.validateDataTypeI18n(baseLocale, targetDataType);
		} else if (targetExportType) {
			errors += i18n.validateExportTypeI18n(baseLocale, targetDataType);
		} else {
			errors += i18n.validateCoreI18n(baseLocale, targetLocale);
			errors += i18n.validateDataTypeI18n(baseLocale);
			errors += i18n.validateExportTypeI18n(baseLocale);
		}

		if (errors) {
			grunt.fail.fatal(errors);
		}
	};

	const sortI18nFiles = () => {
		i18n.locales.forEach((locale) => {
			const data = i18n.getCoreLocaleFileStrings(locale);
			const file = `./src/i18n/${locale}.json`;
			const sortedKeys = Object.keys(data).sort();

			let sortedObj = {};
			sortedKeys.forEach((key) => {
				sortedObj[key] = data[key];
			});

			fs.writeFileSync(file, JSON.stringify(sortedObj, null, '\t'));
		});
	};

	// helper methods to operate on all lang files at once
	grunt.registerTask('removeI18nKey', () => {
		const key = grunt.option('key') || null;
		if (!key) {
			grunt.fail.fatal("Please enter a key to remove. Format: `grunt removeI18nKey --key=word_goodbye");
		}
		i18n.removeKeyFromI18nFiles(grunt.option('key'));
	});

	grunt.loadNpmTasks('grunt-contrib-cssmin');
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-shell');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-contrib-watch');
	grunt.loadNpmTasks('grunt-md5');

	grunt.registerTask('sortI18nFiles', sortI18nFiles);
	grunt.registerTask('default', ['cssmin', 'copy', 'i18n', 'webWorkers']);
	grunt.registerTask('dev', ['cssmin', 'copy', 'i18n', 'webWorkers', 'watch']);
	grunt.registerTask('prod', ['clean:dist', 'build', 'shell:webpackProd']);
	grunt.registerTask('generateWorkerMapFile', generateWorkerMapFile);
	grunt.registerTask('i18n', generateI18nBundles);
	grunt.registerTask('validateI18n', validateI18n);

	grunt.registerTask('webWorkers', [
		...getWebWorkerBuildCommandNames(),
		...getWebWorkerMd5TaskNames(),
		'generateWorkerMapFile'
	]);
};
